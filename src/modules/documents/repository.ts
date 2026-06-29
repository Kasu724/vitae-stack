import type { Pool, PoolClient } from "pg";

import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";

import {
  canonicalDocumentSchema,
  compareDocumentContent,
  createInitialDocument,
  documentKindSchema,
  type CanonicalDocument,
  type DocumentDiff,
  type DocumentKind,
} from "./document-schema";
import { contentHash } from "./hash";

export class DocumentNotFoundError extends Error {
  public constructor() {
    super("The requested resource is unavailable.");
    this.name = "DocumentNotFoundError";
  }
}
export class DocumentConflictError extends Error {
  public constructor() {
    super(
      "This document changed in another session. Reload or compare before saving.",
    );
    this.name = "DocumentConflictError";
  }
}

export interface DocumentRecord {
  id: string;
  kind: DocumentKind;
  title: string;
  status: "active" | "archived";
  current_version_id: string;
  revision: number;
  updated_at: Date;
}
export interface DocumentVersionRecord {
  id: string;
  document_id: string;
  parent_version_id: string | null;
  restored_from_version_id: string | null;
  reason: string;
  content: CanonicalDocument;
  content_hash: string;
  created_at: Date;
}
export interface DocumentDraftRecord {
  id: string;
  base_version_id: string;
  content: CanonicalDocument;
  revision: number;
  updated_at: Date;
}

async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function audit(
  client: PoolClient,
  principal: WorkspacePrincipal,
  action: string,
  targetId: string,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  await client.query(
    `INSERT INTO audit_events (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata) VALUES ($1,$2,$3,'document',$4,'succeeded',$5,$6::jsonb)`,
    [
      principal.workspaceId,
      principal.userId,
      action,
      targetId,
      crypto.randomUUID(),
      JSON.stringify(metadata),
    ],
  );
}

async function projectSections(
  client: PoolClient,
  workspaceId: string,
  versionId: string,
  content: CanonicalDocument,
) {
  for (const [position, section] of content.sections.entries()) {
    await client.query(
      `INSERT INTO document_sections (workspace_id,version_id,stable_section_id,section_type,heading,position,content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        workspaceId,
        versionId,
        section.id,
        section.type,
        section.heading ?? null,
        position,
        contentHash(section),
      ],
    );
  }
}

async function copyClaims(
  client: PoolClient,
  workspaceId: string,
  sourceVersionId: string,
  targetVersionId: string,
  targetContent: CanonicalDocument,
) {
  const sourceVersion = await client.query<{ content: CanonicalDocument }>(
    `SELECT content FROM document_versions WHERE id=$1 AND workspace_id=$2`,
    [sourceVersionId, workspaceId],
  );
  const sourceContent = sourceVersion.rows[0]?.content;
  if (!sourceContent) return;
  const sourceBlocks = new Map(
    sourceContent.sections.flatMap((section) =>
      section.blocks.map((block) => [block.id, block] as const),
    ),
  );
  const targetBlocks = new Map(
    targetContent.sections.flatMap((section) =>
      section.blocks.map((block) => [block.id, block] as const),
    ),
  );
  const claims = await client.query<{
    id: string;
    stable_block_id: string;
    start_offset: number;
    end_offset: number;
    text_hash: string;
    status: "supported" | "unverified" | "nonfactual";
  }>(
    `SELECT id,stable_block_id,start_offset,end_offset,text_hash,status FROM generated_claims WHERE version_id=$1 AND workspace_id=$2`,
    [sourceVersionId, workspaceId],
  );
  for (const claim of claims.rows) {
    const before = sourceBlocks.get(claim.stable_block_id);
    const after = targetBlocks.get(claim.stable_block_id);
    if (
      !after ||
      after.text.length === 0 ||
      claim.start_offset >= after.text.length
    )
      continue;
    const unchanged = before?.text === after.text;
    const created = await client.query<{ id: string }>(
      `INSERT INTO generated_claims (workspace_id,version_id,stable_block_id,start_offset,end_offset,text_hash,status,source_claim_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        workspaceId,
        targetVersionId,
        claim.stable_block_id,
        claim.start_offset,
        Math.min(claim.end_offset, after.text.length),
        claim.text_hash,
        unchanged ? claim.status : "unverified",
        claim.id,
      ],
    );
    if (unchanged && claim.status === "supported") {
      await client.query(
        `INSERT INTO claim_evidence (workspace_id,claim_id,evidence_fact_id)
         SELECT workspace_id,$3,evidence_fact_id FROM claim_evidence WHERE claim_id=$1 AND workspace_id=$2`,
        [claim.id, workspaceId, created.rows[0]!.id],
      );
    }
  }
}

export class DocumentRepository {
  public constructor(private readonly pool: Pool) {}

  public async list(
    principal: WorkspacePrincipal,
    status: "active" | "archived" = "active",
  ): Promise<DocumentRecord[]> {
    const result = await this.pool.query<DocumentRecord>(
      `SELECT id,kind,title,status,current_version_id,revision,updated_at FROM documents WHERE workspace_id=$1 AND status=$2 ORDER BY updated_at DESC,id`,
      [principal.workspaceId, status],
    );
    return result.rows;
  }

  public async create(
    principal: WorkspacePrincipal,
    raw: { kind: DocumentKind; title: string },
  ): Promise<string> {
    const kind = documentKindSchema.parse(raw.kind);
    const title = raw.title.trim();
    if (!title || title.length > 200)
      throw new Error(
        "Document title must contain between 1 and 200 characters.",
      );
    const content = createInitialDocument(kind);
    return transaction(this.pool, async (client) => {
      const document = await client.query<{ id: string }>(
        `INSERT INTO documents (workspace_id,career_profile_id,kind,title) SELECT $1,id,$2,$3 FROM career_profiles WHERE workspace_id=$1 RETURNING id`,
        [principal.workspaceId, kind, title],
      );
      const id = document.rows[0]?.id;
      if (!id) throw new DocumentNotFoundError();
      const version = await client.query<{ id: string }>(
        `INSERT INTO document_versions (workspace_id,document_id,author_user_id,reason,content,content_hash) VALUES ($1,$2,$3,'initial',$4::jsonb,$5) RETURNING id`,
        [
          principal.workspaceId,
          id,
          principal.userId,
          JSON.stringify(content),
          contentHash(content),
        ],
      );
      const versionId = version.rows[0]!.id;
      await projectSections(client, principal.workspaceId, versionId, content);
      await client.query(
        `UPDATE documents SET current_version_id=$3 WHERE id=$1 AND workspace_id=$2`,
        [id, principal.workspaceId, versionId],
      );
      await audit(client, principal, "document.create", id, {
        kind,
        versionId,
      });
      return id;
    });
  }

  public async get(
    principal: WorkspacePrincipal,
    documentId: string,
  ): Promise<{
    document: DocumentRecord;
    currentVersion: DocumentVersionRecord;
    draft: DocumentDraftRecord | null;
    versions: DocumentVersionRecord[];
  }> {
    const document = await this.pool.query<DocumentRecord>(
      `SELECT id,kind,title,status,current_version_id,revision,updated_at FROM documents WHERE id=$1 AND workspace_id=$2`,
      [documentId, principal.workspaceId],
    );
    if (!document.rows[0]) throw new DocumentNotFoundError();
    const [current, draft, versions] = await Promise.all([
      this.pool.query<DocumentVersionRecord>(
        `SELECT id,document_id,parent_version_id,restored_from_version_id,reason,content,content_hash,created_at FROM document_versions WHERE id=$1 AND workspace_id=$2 AND document_id=$3`,
        [
          document.rows[0].current_version_id,
          principal.workspaceId,
          documentId,
        ],
      ),
      this.pool.query<DocumentDraftRecord>(
        `SELECT id,base_version_id,content,revision,updated_at FROM document_drafts WHERE document_id=$1 AND workspace_id=$2 AND user_id=$3`,
        [documentId, principal.workspaceId, principal.userId],
      ),
      this.pool.query<DocumentVersionRecord>(
        `SELECT id,document_id,parent_version_id,restored_from_version_id,reason,content,content_hash,created_at FROM document_versions WHERE document_id=$1 AND workspace_id=$2 ORDER BY created_at DESC,id DESC`,
        [documentId, principal.workspaceId],
      ),
    ]);
    if (!current.rows[0]) throw new DocumentNotFoundError();
    return {
      document: document.rows[0],
      currentVersion: current.rows[0],
      draft: draft.rows[0] ?? null,
      versions: versions.rows,
    };
  }

  public async saveDraft(
    principal: WorkspacePrincipal,
    input: {
      documentId: string;
      baseVersionId: string;
      expectedRevision: number;
      content: unknown;
    },
  ): Promise<DocumentDraftRecord> {
    const content = canonicalDocumentSchema.parse(input.content);
    return transaction(this.pool, async (client) => {
      const document = await client.query<{
        kind: DocumentKind;
        current_version_id: string;
      }>(
        `SELECT kind,current_version_id FROM documents WHERE id=$1 AND workspace_id=$2 FOR UPDATE`,
        [input.documentId, principal.workspaceId],
      );
      const row = document.rows[0];
      if (!row) throw new DocumentNotFoundError();
      if (
        row.current_version_id !== input.baseVersionId ||
        row.kind !== content.kind
      )
        throw new DocumentConflictError();
      const existing = await client.query<DocumentDraftRecord>(
        `SELECT id,base_version_id,content,revision,updated_at FROM document_drafts WHERE document_id=$1 AND workspace_id=$2 AND user_id=$3 FOR UPDATE`,
        [input.documentId, principal.workspaceId, principal.userId],
      );
      let result;
      if (!existing.rows[0]) {
        if (input.expectedRevision !== 0) throw new DocumentConflictError();
        result = await client.query<DocumentDraftRecord>(
          `INSERT INTO document_drafts (workspace_id,document_id,user_id,base_version_id,content,expires_at) VALUES ($1,$2,$3,$4,$5::jsonb,now()+interval '30 days') RETURNING id,base_version_id,content,revision,updated_at`,
          [
            principal.workspaceId,
            input.documentId,
            principal.userId,
            input.baseVersionId,
            JSON.stringify(content),
          ],
        );
      } else {
        if (
          existing.rows[0].revision !== input.expectedRevision ||
          existing.rows[0].base_version_id !== input.baseVersionId
        )
          throw new DocumentConflictError();
        result = await client.query<DocumentDraftRecord>(
          `UPDATE document_drafts SET content=$4::jsonb,revision=revision+1,expires_at=now()+interval '30 days',updated_at=now() WHERE document_id=$1 AND workspace_id=$2 AND user_id=$3 RETURNING id,base_version_id,content,revision,updated_at`,
          [
            input.documentId,
            principal.workspaceId,
            principal.userId,
            JSON.stringify(content),
          ],
        );
      }
      return result.rows[0]!;
    });
  }

  public async commitVersion(
    principal: WorkspacePrincipal,
    input: {
      documentId: string;
      baseVersionId: string;
      content: unknown;
      reason?: "manual_save" | "suggestion_batch" | "tailoring" | "restore";
      restoredFromVersionId?: string;
      idempotencyKey?: string;
    },
  ): Promise<string> {
    const content = canonicalDocumentSchema.parse(input.content);
    return transaction(this.pool, async (client) => {
      const document = await client.query<{
        kind: DocumentKind;
        current_version_id: string;
      }>(
        `SELECT kind,current_version_id FROM documents WHERE id=$1 AND workspace_id=$2 FOR UPDATE`,
        [input.documentId, principal.workspaceId],
      );
      const row = document.rows[0];
      if (!row) throw new DocumentNotFoundError();
      if (input.idempotencyKey) {
        const prior = await client.query<{ target_id: string }>(
          `SELECT metadata->>'versionId' target_id FROM audit_events WHERE workspace_id=$1 AND target_id=$2 AND action='document.version-create' AND metadata->>'idempotencyKey'=$3 LIMIT 1`,
          [principal.workspaceId, input.documentId, input.idempotencyKey],
        );
        if (prior.rows[0]?.target_id) return prior.rows[0].target_id;
      }
      if (
        row.current_version_id !== input.baseVersionId ||
        row.kind !== content.kind
      )
        throw new DocumentConflictError();
      const created = await client.query<{ id: string }>(
        `INSERT INTO document_versions (workspace_id,document_id,parent_version_id,restored_from_version_id,author_user_id,reason,content,content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id`,
        [
          principal.workspaceId,
          input.documentId,
          row.current_version_id,
          input.restoredFromVersionId ?? null,
          principal.userId,
          input.reason ?? "manual_save",
          JSON.stringify(content),
          contentHash(content),
        ],
      );
      const versionId = created.rows[0]!.id;
      await projectSections(client, principal.workspaceId, versionId, content);
      await copyClaims(
        client,
        principal.workspaceId,
        input.restoredFromVersionId ?? row.current_version_id,
        versionId,
        content,
      );
      await client.query(
        `UPDATE documents SET current_version_id=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND workspace_id=$2`,
        [input.documentId, principal.workspaceId, versionId],
      );
      await client.query(
        `DELETE FROM document_drafts WHERE document_id=$1 AND workspace_id=$2 AND user_id=$3`,
        [input.documentId, principal.workspaceId, principal.userId],
      );
      await audit(
        client,
        principal,
        "document.version-create",
        input.documentId,
        {
          versionId,
          idempotencyKey: input.idempotencyKey ?? null,
          reason: input.reason ?? "manual_save",
        },
      );
      return versionId;
    });
  }

  public async restore(
    principal: WorkspacePrincipal,
    documentId: string,
    restoreVersionId: string,
    expectedCurrentVersionId: string,
  ): Promise<string> {
    const source = await this.pool.query<{ content: CanonicalDocument }>(
      `SELECT content FROM document_versions WHERE id=$1 AND document_id=$2 AND workspace_id=$3`,
      [restoreVersionId, documentId, principal.workspaceId],
    );
    if (!source.rows[0]) throw new DocumentNotFoundError();
    return this.commitVersion(principal, {
      documentId,
      baseVersionId: expectedCurrentVersionId,
      content: source.rows[0].content,
      reason: "restore",
      restoredFromVersionId: restoreVersionId,
    });
  }

  public async compare(
    principal: WorkspacePrincipal,
    documentId: string,
    beforeId: string,
    afterId: string,
  ): Promise<DocumentDiff> {
    const versions = await this.pool.query<{
      id: string;
      content: CanonicalDocument;
    }>(
      `SELECT id,content FROM document_versions WHERE workspace_id=$1 AND document_id=$2 AND id=ANY($3::uuid[])`,
      [principal.workspaceId, documentId, [beforeId, afterId]],
    );
    const before = versions.rows.find((row) => row.id === beforeId);
    const after = versions.rows.find((row) => row.id === afterId);
    if (!before || !after) throw new DocumentNotFoundError();
    const diff = compareDocumentContent(before.content, after.content);
    const claims = await this.pool.query<{
      id: string;
      version_id: string;
      source_claim_id: string | null;
      status: string;
      text_hash: string;
      evidence_ids: string[];
    }>(
      `SELECT c.id,c.version_id,c.source_claim_id,c.status,c.text_hash,
              coalesce(array_agg(e.evidence_fact_id::text) FILTER (WHERE e.evidence_fact_id IS NOT NULL),ARRAY[]::text[]) evidence_ids
       FROM generated_claims c LEFT JOIN claim_evidence e ON e.claim_id=c.id AND e.workspace_id=c.workspace_id
       WHERE c.workspace_id=$1 AND c.version_id=ANY($2::uuid[])
       GROUP BY c.id`,
      [principal.workspaceId, [beforeId, afterId]],
    );
    const oldClaims = claims.rows.filter(
      (claim) => claim.version_id === beforeId,
    );
    const newClaims = claims.rows.filter(
      (claim) => claim.version_id === afterId,
    );
    const newBySource = new Map(
      newClaims
        .filter((claim) => claim.source_claim_id)
        .map((claim) => [claim.source_claim_id!, claim]),
    );
    diff.addedClaims = newClaims
      .filter((claim) => !claim.source_claim_id)
      .map((claim) => claim.id);
    diff.removedClaims = oldClaims
      .filter((claim) => !newBySource.has(claim.id))
      .map((claim) => claim.id);
    diff.changedClaims = oldClaims
      .filter((claim) => {
        const next = newBySource.get(claim.id);
        return (
          next &&
          (next.status !== claim.status || next.text_hash !== claim.text_hash)
        );
      })
      .map((claim) => claim.id);
    diff.provenanceChanges = oldClaims
      .filter((claim) => {
        const next = newBySource.get(claim.id);
        return (
          next &&
          [...next.evidence_ids].sort().join(",") !==
            [...claim.evidence_ids].sort().join(",")
        );
      })
      .map((claim) => claim.id);
    return diff;
  }

  public async setArchived(
    principal: WorkspacePrincipal,
    documentId: string,
    archived: boolean,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE documents SET status=$3::document_status,archived_at=CASE WHEN $3::text='archived' THEN now() ELSE NULL END,revision=revision+1,updated_at=now() WHERE id=$1 AND workspace_id=$2`,
      [documentId, principal.workspaceId, archived ? "archived" : "active"],
    );
    if (!result.rowCount) throw new DocumentNotFoundError();
  }

  public async rename(
    principal: WorkspacePrincipal,
    documentId: string,
    titleInput: string,
  ): Promise<void> {
    const title = titleInput.trim();
    if (!title || title.length > 200)
      throw new Error(
        "Document title must contain between 1 and 200 characters.",
      );
    const result = await this.pool.query(
      `UPDATE documents SET title=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND workspace_id=$2`,
      [documentId, principal.workspaceId, title],
    );
    if (!result.rowCount) throw new DocumentNotFoundError();
  }
}
