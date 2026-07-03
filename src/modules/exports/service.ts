import { createHash } from "node:crypto";

import type { Pool, PoolClient } from "@/infrastructure/database/sqlite-pool";

import type { ExportManifestValue } from "@/infrastructure/database/value-types";
import {
  exportArtifactStorageKey,
  FilesystemArtifactStore,
} from "@/infrastructure/artifacts/filesystem-store";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { canonicalDocumentSchema } from "@/modules/documents/document-schema";
import { contentHash } from "@/modules/documents/hash";
import { parseSourceBuffer } from "@/modules/ingestion/parsers";

import {
  EXPORT_TEMPLATE_ID,
  ExportValidationError,
  exportFormatSchema,
  exportSourceText,
  normalizedExportTokens,
  orderedTokenCoverage,
  safeExportFilename,
  type ExportFormat,
  type RenderedExport,
} from "./domain";
import { renderExport } from "./renderers";

export class ExportNotFoundError extends Error {
  public constructor() {
    super("The export input or artifact is unavailable.");
    this.name = "ExportNotFoundError";
  }
}

export class ExportRateLimitError extends Error {
  public constructor() {
    super("Too many new exports were requested. Try again shortly.");
    this.name = "ExportRateLimitError";
  }
}

interface SupportStateRow {
  claim_id: string;
  claim_status: "supported" | "unverified" | "nonfactual";
  evidence_fact_id: string | null;
  fact_status: string | null;
  entry_status: string | null;
}

export interface ExportSetupData {
  document: {
    id: string;
    title: string;
    kind: string;
    current_version_id: string;
  };
  versions: Array<{
    id: string;
    reason: string;
    created_at: Date;
    current: boolean;
  }>;
  artifacts: ExportArtifactRecord[];
}

export interface ExportArtifactRecord {
  id: string;
  document_version_id: string;
  format: ExportFormat;
  classification: "final" | "draft";
  media_type: string;
  filename: string;
  storage_key: string;
  byte_size: number;
  content_hash: string;
  manifest: ExportManifestValue;
  expires_at: Date;
  created_at: Date;
}

async function begin<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function byteHash(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function unsupportedClaims(rows: SupportStateRow[]): string[] {
  const byClaim = new Map<string, SupportStateRow[]>();
  for (const row of rows) {
    if (row.claim_status === "nonfactual") continue;
    const current = byClaim.get(row.claim_id) ?? [];
    current.push(row);
    byClaim.set(row.claim_id, current);
  }
  return [...byClaim]
    .filter(([, claimRows]) => {
      const first = claimRows[0]!;
      return (
        first.claim_status !== "supported" ||
        !claimRows.some((row) => row.evidence_fact_id !== null) ||
        claimRows.some(
          (row) =>
            row.evidence_fact_id === null ||
            row.fact_status !== "approved" ||
            row.entry_status !== "active",
        )
      );
    })
    .map(([claimId]) => claimId)
    .sort();
}

async function validateParseBack(rendered: RenderedExport): Promise<void> {
  let parsedText: string;
  if (rendered.format === "pdf") {
    parsedText = (
      await parseSourceBuffer("application/pdf", rendered.bytes, 500_000)
    ).text;
  } else if (rendered.format === "docx") {
    parsedText = (
      await parseSourceBuffer(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        rendered.bytes,
        500_000,
      )
    ).text;
  } else if (rendered.format === "json") {
    const value = JSON.parse(rendered.bytes.toString("utf8")) as {
      document?: unknown;
    };
    parsedText = exportSourceText(
      canonicalDocumentSchema.parse(value.document),
    );
  } else if (rendered.format === "markdown") {
    parsedText = rendered.bytes
      .toString("utf8")
      .replace(/\\([\\`*_{}\[\]()#+.!|~-])/gu, "$1");
  } else {
    parsedText = rendered.bytes.toString("utf8");
  }
  const sourceTokens = normalizedExportTokens(rendered.sourceText);
  if (
    sourceTokens.length > 0 &&
    orderedTokenCoverage(rendered.sourceText, parsedText) < 0.98
  )
    throw new ExportValidationError(
      "Rendered text did not pass the parse-back equivalence threshold.",
    );
}

async function audit(
  client: PoolClient,
  principal: WorkspacePrincipal,
  artifactId: string,
  format: ExportFormat,
  classification: "final" | "draft",
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events
       (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata)
     VALUES ($1,$2,'export.generate','export_artifact',$3,'succeeded',$4,$5::jsonb)`,
    [
      principal.workspaceId,
      principal.userId,
      artifactId,
      crypto.randomUUID(),
      JSON.stringify({ format, classification }),
    ],
  );
}

export class ExportService {
  public constructor(
    private readonly pool: Pool,
    private readonly store: FilesystemArtifactStore,
  ) {}

  public async getSetup(
    principal: WorkspacePrincipal,
    documentId: string,
  ): Promise<ExportSetupData> {
    const [document, versions, artifacts] = await Promise.all([
      this.pool.query<ExportSetupData["document"]>(
        `SELECT id,title,kind,current_version_id FROM documents
         WHERE id=$1 AND workspace_id=$2 AND status='active' AND current_version_id IS NOT NULL`,
        [documentId, principal.workspaceId],
      ),
      this.pool.query<ExportSetupData["versions"][number]>(
        `SELECT v.id,v.reason,v.created_at,(v.id=d.current_version_id) current
         FROM document_versions v JOIN documents d ON d.id=v.document_id AND d.workspace_id=v.workspace_id
         WHERE d.id=$1 AND d.workspace_id=$2 ORDER BY v.created_at DESC,v.id DESC`,
        [documentId, principal.workspaceId],
      ),
      this.pool.query<ExportArtifactRecord>(
        `SELECT a.id,a.document_version_id,a.format,a.classification,a.media_type,a.filename,a.storage_key,
                a.byte_size::int AS byte_size,a.content_hash,a.manifest,a.expires_at,a.created_at
         FROM export_artifacts a
         JOIN document_versions v ON v.id=a.document_version_id AND v.workspace_id=a.workspace_id
         WHERE v.document_id=$1 AND a.workspace_id=$2 AND a.expires_at>now()
         ORDER BY a.created_at DESC`,
        [documentId, principal.workspaceId],
      ),
    ]);
    if (!document.rows[0]) throw new ExportNotFoundError();
    return {
      document: document.rows[0],
      versions: versions.rows,
      artifacts: artifacts.rows,
    };
  }

  public async generate(
    principal: WorkspacePrincipal,
    input: { documentId: string; versionId: string; format: string },
  ): Promise<ExportArtifactRecord> {
    const format = exportFormatSchema.parse(input.format);
    let newStorageKey: string | null = null;
    let expiredStorageKey: string | null = null;
    let committed = false;
    try {
      const artifact = await begin(this.pool, async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [
            `export-request:${principal.workspaceId}:${input.versionId}:${format}`,
          ],
        );
        const versionResult = await client.query<{
          id: string;
          title: string;
          content: unknown;
          content_hash: string;
        }>(
          `SELECT v.id,d.title,v.content,v.content_hash
           FROM document_versions v
           JOIN documents d ON d.id=v.document_id AND d.workspace_id=v.workspace_id
           WHERE d.id=$1 AND v.id=$2 AND d.workspace_id=$3 AND d.status='active'`,
          [input.documentId, input.versionId, principal.workspaceId],
        );
        const version = versionResult.rows[0];
        if (!version) throw new ExportNotFoundError();
        const document = canonicalDocumentSchema.parse(version.content);
        const supportResult = await client.query<SupportStateRow>(
          `SELECT c.id claim_id,c.status claim_status,ce.evidence_fact_id,
                  f.status fact_status,e.status entry_status
           FROM generated_claims c
           LEFT JOIN claim_evidence ce ON ce.claim_id=c.id AND ce.workspace_id=c.workspace_id
           LEFT JOIN evidence_facts f ON f.id=ce.evidence_fact_id AND f.workspace_id=ce.workspace_id
           LEFT JOIN career_entries e ON e.id=f.career_entry_id AND e.workspace_id=f.workspace_id
           WHERE c.version_id=$1 AND c.workspace_id=$2
           ORDER BY c.id,ce.evidence_fact_id`,
          [version.id, principal.workspaceId],
        );
        const unsupportedClaimIds = unsupportedClaims(supportResult.rows);
        const rendered = await renderExport({
          title: version.title,
          format,
          document,
          unsupportedClaimIds,
        });
        await validateParseBack(rendered);
        const inputHash = contentHash({
          sourceDocumentHash: version.content_hash,
          format,
          templateId: EXPORT_TEMPLATE_ID,
          rendererVersion: rendered.rendererVersion,
          supportState: supportResult.rows,
        });
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`export:${principal.workspaceId}:${inputHash}`],
        );
        const existing = await client.query<ExportArtifactRecord>(
          `SELECT id,document_version_id,format,classification,media_type,filename,storage_key,
                  byte_size::int AS byte_size,content_hash,manifest,expires_at,created_at
           FROM export_artifacts WHERE workspace_id=$1 AND input_hash=$2`,
          [principal.workspaceId, inputHash],
        );
        if (existing.rows[0] && existing.rows[0].expires_at > new Date())
          return existing.rows[0];
        if (existing.rows[0]) {
          expiredStorageKey = existing.rows[0].storage_key;
          await client.query(
            "DELETE FROM export_artifacts WHERE id=$1 AND workspace_id=$2",
            [existing.rows[0].id, principal.workspaceId],
          );
        }
        const recent = await client.query<{ count: string }>(
          `SELECT count(*)::text count FROM export_artifacts
           WHERE workspace_id=$1 AND requested_by_user_id=$2 AND created_at>now()-interval '1 minute'`,
          [principal.workspaceId, principal.userId],
        );
        if (Number(recent.rows[0]!.count) >= 10)
          throw new ExportRateLimitError();

        const artifactId = crypto.randomUUID();
        const storageKey = exportArtifactStorageKey(
          principal.workspaceId,
          artifactId,
        );
        newStorageKey = storageKey;
        await this.store.putExclusive(storageKey, rendered.bytes);
        const manifest: ExportManifestValue = {
          schemaVersion: 1,
          templateId: EXPORT_TEMPLATE_ID,
          rendererVersion: rendered.rendererVersion,
          sourceDocumentHash: version.content_hash,
          unsupportedClaimIds,
          warnings: rendered.warnings,
        };
        const inserted = await client.query<ExportArtifactRecord>(
          `INSERT INTO export_artifacts
             (id,workspace_id,document_version_id,requested_by_user_id,format,classification,media_type,filename,storage_key,byte_size,content_hash,input_hash,manifest,expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,now()+interval '24 hours')
           RETURNING id,document_version_id,format,classification,media_type,filename,storage_key,byte_size::int AS byte_size,content_hash,manifest,expires_at,created_at`,
          [
            artifactId,
            principal.workspaceId,
            version.id,
            principal.userId,
            format,
            rendered.classification,
            rendered.mediaType,
            safeExportFilename(version.title, rendered.extension),
            storageKey,
            rendered.bytes.length,
            byteHash(rendered.bytes),
            inputHash,
            JSON.stringify(manifest),
          ],
        );
        await audit(
          client,
          principal,
          artifactId,
          format,
          rendered.classification,
        );
        return inserted.rows[0]!;
      });
      committed = true;
      newStorageKey = null;
      if (expiredStorageKey) await this.store.delete(expiredStorageKey);
      return artifact;
    } catch (error) {
      if (!committed && newStorageKey) await this.store.delete(newStorageKey);
      throw error;
    }
  }

  public async getArtifact(
    principal: WorkspacePrincipal,
    artifactId: string,
  ): Promise<{ artifact: ExportArtifactRecord; bytes: Buffer }> {
    const result = await this.pool.query<ExportArtifactRecord>(
      `SELECT id,document_version_id,format,classification,media_type,filename,storage_key,
              byte_size::int AS byte_size,content_hash,manifest,expires_at,created_at
       FROM export_artifacts WHERE id=$1 AND workspace_id=$2 AND expires_at>now()`,
      [artifactId, principal.workspaceId],
    );
    const artifact = result.rows[0];
    if (!artifact) throw new ExportNotFoundError();
    const bytes = await this.store.read(artifact.storage_key);
    if (
      bytes.length !== artifact.byte_size ||
      byteHash(bytes) !== artifact.content_hash
    )
      throw new ExportValidationError("Stored export integrity check failed.");
    return { artifact, bytes };
  }
}
