import { createHash } from "node:crypto";

import {
  type Pool,
  type PoolClient,
  withTransaction as begin,
} from "@/infrastructure/database/sqlite-pool";

import type { ExportManifestValue } from "@/infrastructure/database/value-types";
import {
  exportArtifactStorageKey,
  FilesystemArtifactStore,
} from "@/infrastructure/artifacts/filesystem-store";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { canonicalDocumentSchema } from "@/modules/documents/document-schema";
import { contentHash } from "@/modules/documents/hash";
import {
  assessDocumentGrounding,
  GROUNDING_POLICY_VERSION,
  groundingStateHash,
  type DocumentGroundingClaim,
} from "@/modules/documents/grounding";
import { parseSourceBuffer } from "@/modules/ingestion/parsers";

import {
  EXPORT_TEMPLATE_ID,
  ExportValidationError,
  exportFormatSchema,
  exportSourceText,
  normalizedExportTokens,
  orderedTokenCoverage,
  safeExportFilename,
  sanitizeExportDocument,
  type ExportFormat,
  type RenderedExport,
  UnsupportedExportClaimsError,
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
  stable_block_id: string;
  start_offset: number;
  end_offset: number;
  text_hash: string;
  claim_status: "supported" | "unverified" | "nonfactual";
  evidence_fact_id: string | null;
  evidence_display_text: string | null;
  evidence_value: unknown;
  fact_status: string | null;
  entry_status: string | null;
}

interface VersionGroundingState {
  document: ReturnType<typeof canonicalDocumentSchema.parse>;
  supportRows: SupportStateRow[];
  unsupportedClaimIds: string[];
  groundingStateHash: string;
}

type JoinedArtifactRow = ExportArtifactRecord & {
  version_content: unknown;
  version_content_hash: string;
};

function artifactRecord(row: JoinedArtifactRow): ExportArtifactRecord {
  return {
    id: row.id,
    document_version_id: row.document_version_id,
    format: row.format,
    classification: row.classification,
    media_type: row.media_type,
    filename: row.filename,
    storage_key: row.storage_key,
    byte_size: row.byte_size,
    content_hash: row.content_hash,
    manifest: row.manifest,
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
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

function byteHash(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function groundingClaims(rows: SupportStateRow[]): DocumentGroundingClaim[] {
  const byClaim = new Map<string, DocumentGroundingClaim>();
  for (const row of rows) {
    const current = byClaim.get(row.claim_id) ?? {
      id: row.claim_id,
      stableBlockId: row.stable_block_id,
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      textHash: row.text_hash,
      status: row.claim_status,
      evidence: [],
    };
    if (
      row.evidence_fact_id &&
      row.evidence_display_text !== null &&
      !current.evidence.some((item) => item.id === row.evidence_fact_id)
    )
      current.evidence.push({
        id: row.evidence_fact_id,
        displayText: row.evidence_display_text,
        value:
          typeof row.evidence_value === "string"
            ? parseJsonValue(row.evidence_value)
            : row.evidence_value,
        ...(row.fact_status ? { factStatus: row.fact_status } : {}),
        ...(row.entry_status ? { entryStatus: row.entry_status } : {}),
      });
    byClaim.set(row.claim_id, current);
  }
  return [...byClaim.values()];
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function loadVersionGroundingState(
  client: PoolClient,
  workspaceId: string,
  version: { id: string; content: unknown; content_hash: string },
): Promise<VersionGroundingState> {
  let document: ReturnType<typeof canonicalDocumentSchema.parse>;
  try {
    const content =
      typeof version.content === "string"
        ? (JSON.parse(version.content) as unknown)
        : version.content;
    document = canonicalDocumentSchema.parse(content);
  } catch {
    throw new ExportValidationError(
      "The selected document version has invalid canonical content.",
    );
  }
  if (contentHash(document) !== version.content_hash)
    throw new ExportValidationError(
      "The selected document version failed its integrity check.",
    );
  const supportResult = await client.query<SupportStateRow>(
    `SELECT c.id claim_id,c.stable_block_id,c.start_offset,c.end_offset,c.text_hash,
            c.status claim_status,ce.evidence_fact_id,
            f.display_text evidence_display_text,f.value evidence_value,
            f.status fact_status,e.status entry_status
     FROM generated_claims c
     LEFT JOIN claim_evidence ce ON ce.claim_id=c.id AND ce.workspace_id=c.workspace_id
     LEFT JOIN evidence_facts f ON f.id=ce.evidence_fact_id AND f.workspace_id=ce.workspace_id
     LEFT JOIN career_entries e ON e.id=f.career_entry_id AND e.workspace_id=f.workspace_id
     WHERE c.version_id=$1 AND c.workspace_id=$2
     ORDER BY c.id,ce.evidence_fact_id`,
    [version.id, workspaceId],
  );
  const claims = groundingClaims(supportResult.rows);
  const unsupportedClaimIds = assessDocumentGrounding(
    document,
    claims,
  ).unsupportedClaimIds;
  return {
    document,
    supportRows: supportResult.rows,
    unsupportedClaimIds,
    groundingStateHash: groundingStateHash(claims, unsupportedClaimIds),
  };
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
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
        const grounding = await loadVersionGroundingState(
          client,
          principal.workspaceId,
          version,
        );
        const { document, unsupportedClaimIds } = grounding;
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
          groundingPolicyVersion: GROUNDING_POLICY_VERSION,
          groundingStateHash: grounding.groundingStateHash,
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
          groundingPolicyVersion: GROUNDING_POLICY_VERSION,
          groundingStateHash: grounding.groundingStateHash,
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
    const validated = await begin(this.pool, async (client) => {
      const result = await client.query<JoinedArtifactRow>(
        `SELECT a.id,a.document_version_id,a.format,a.classification,a.media_type,a.filename,a.storage_key,
                a.byte_size::int AS byte_size,a.content_hash,a.manifest,a.expires_at,a.created_at,
                v.content version_content,v.content_hash version_content_hash
         FROM export_artifacts a
         JOIN document_versions v ON v.id=a.document_version_id AND v.workspace_id=a.workspace_id
         WHERE a.id=$1 AND a.workspace_id=$2 AND a.expires_at>now()`,
        [artifactId, principal.workspaceId],
      );
      const row = result.rows[0];
      if (!row) throw new ExportNotFoundError();
      const grounding = await loadVersionGroundingState(
        client,
        principal.workspaceId,
        {
          id: row.document_version_id,
          content: row.version_content,
          content_hash: row.version_content_hash,
        },
      );
      if (
        (row.format === "pdf" || row.format === "docx") &&
        grounding.unsupportedClaimIds.length > 0
      )
        throw new UnsupportedExportClaimsError(grounding.unsupportedClaimIds);
      const expectedClassification = grounding.unsupportedClaimIds.length
        ? "draft"
        : "final";
      if (
        row.manifest.groundingPolicyVersion !== GROUNDING_POLICY_VERSION ||
        row.manifest.sourceDocumentHash !== row.version_content_hash ||
        row.manifest.groundingStateHash !== grounding.groundingStateHash ||
        !sameStrings(
          row.manifest.unsupportedClaimIds,
          grounding.unsupportedClaimIds,
        ) ||
        row.classification !== expectedClassification
      )
        throw new ExportValidationError(
          "Stored export provenance no longer matches its document version.",
        );
      return { artifact: artifactRecord(row), document: grounding.document };
    });
    const { artifact, document } = validated;
    const bytes = await this.store.read(artifact.storage_key);
    if (
      bytes.length !== artifact.byte_size ||
      byteHash(bytes) !== artifact.content_hash
    )
      throw new ExportValidationError("Stored export integrity check failed.");
    const sanitized = sanitizeExportDocument(document);
    await validateParseBack({
      bytes,
      format: artifact.format,
      classification: artifact.classification,
      mediaType: artifact.media_type,
      extension: artifact.filename.split(".").at(-1) ?? artifact.format,
      rendererVersion: artifact.manifest.rendererVersion,
      warnings: artifact.manifest.warnings,
      sourceText: exportSourceText(sanitized.document),
    });
    return { artifact, bytes };
  }
}
