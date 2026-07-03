import type { Pool } from "@/infrastructure/database/sqlite-pool";

import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import type { ParsedSource } from "./parsers";

export interface SourceDocumentRecord {
  id: string;
  purpose:
    | "resume"
    | "cover_letter"
    | "job_description"
    | "career_evidence"
    | "project_import";
  original_name: string;
  declared_media_type: string;
  detected_media_type: string;
  byte_size: number;
  content_hash: string;
  storage_key: string;
  status: "quarantined" | "processing" | "ready" | "rejected" | "deleted";
  extracted_text: string | null;
  parse_metadata: {
    schemaVersion: 1;
    pageCount?: number;
    paragraphCount?: number;
  };
  warnings: string[];
  parser_version: string | null;
  error_code: string | null;
  created_at: Date;
}

export class SourceNotFoundError extends Error {
  public constructor() {
    super("The requested resource is unavailable.");
    this.name = "SourceNotFoundError";
  }
}

export class SourceRateLimitError extends Error {
  public constructor() {
    super("The source upload rate limit was reached.");
    this.name = "SourceRateLimitError";
  }
}

export class SourceDependencyError extends Error {
  public constructor() {
    super("Resolve pending extraction proposals before deleting this source.");
    this.name = "SourceDependencyError";
  }
}

export class SourceRepository {
  public constructor(private readonly pool: Pool) {}

  public async insertQuarantined(
    principal: WorkspacePrincipal,
    input: Omit<
      SourceDocumentRecord,
      | "status"
      | "extracted_text"
      | "parse_metadata"
      | "warnings"
      | "parser_version"
      | "error_code"
      | "created_at"
    >,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`source-upload:${principal.workspaceId}`],
      );
      const recent = await client.query<{ count: string }>(
        `SELECT count(*)::text count FROM source_documents WHERE workspace_id=$1 AND created_at>now()-interval '1 hour'`,
        [principal.workspaceId],
      );
      if (Number(recent.rows[0]!.count) >= 20) throw new SourceRateLimitError();
      await client.query(
        `INSERT INTO source_documents (id,workspace_id,uploaded_by_user_id,purpose,original_name,declared_media_type,detected_media_type,byte_size,content_hash,storage_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          input.id,
          principal.workspaceId,
          principal.userId,
          input.purpose,
          input.original_name,
          input.declared_media_type,
          input.detected_media_type,
          input.byte_size,
          input.content_hash,
          input.storage_key,
        ],
      );
      await client.query(
        `INSERT INTO audit_events (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata)
         VALUES ($1,$2,'source.upload','source_document',$3,'succeeded',$4,$5::jsonb)`,
        [
          principal.workspaceId,
          principal.userId,
          input.id,
          crypto.randomUUID(),
          JSON.stringify({ byteSize: input.byte_size, purpose: input.purpose }),
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async markProcessing(
    principal: WorkspacePrincipal,
    id: string,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE source_documents SET status='processing',updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status='quarantined'`,
      [id, principal.workspaceId],
    );
    if (!result.rowCount) throw new SourceNotFoundError();
  }

  public async markReady(
    principal: WorkspacePrincipal,
    id: string,
    parsed: ParsedSource,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE source_documents SET status='ready',extracted_text=$3,parse_metadata=$4::jsonb,warnings=$5,parser_version=$6,error_code=NULL,processed_at=now(),updated_at=now()
       WHERE id=$1 AND workspace_id=$2 AND status IN ('quarantined','processing')`,
      [
        id,
        principal.workspaceId,
        parsed.text,
        JSON.stringify(parsed.metadata),
        parsed.warnings,
        parsed.parserVersion,
      ],
    );
    if (!result.rowCount) throw new SourceNotFoundError();
  }

  public async markRejected(
    principal: WorkspacePrincipal,
    id: string,
    errorCode: string,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE source_documents SET status='rejected',error_code=$3,processed_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status IN ('quarantined','processing')`,
      [id, principal.workspaceId, errorCode.slice(0, 100)],
    );
    if (!result.rowCount) throw new SourceNotFoundError();
  }

  public async list(
    principal: WorkspacePrincipal,
  ): Promise<SourceDocumentRecord[]> {
    const result = await this.pool.query<SourceDocumentRecord>(
      `SELECT id,purpose,original_name,declared_media_type,detected_media_type,byte_size,content_hash,storage_key,status,extracted_text,parse_metadata,warnings,parser_version,error_code,created_at FROM source_documents WHERE workspace_id=$1 AND status<>'deleted' ORDER BY created_at DESC,id`,
      [principal.workspaceId],
    );
    return result.rows;
  }

  public async get(
    principal: WorkspacePrincipal,
    id: string,
  ): Promise<SourceDocumentRecord> {
    const result = await this.pool.query<SourceDocumentRecord>(
      `SELECT id,purpose,original_name,declared_media_type,detected_media_type,byte_size,content_hash,storage_key,status,extracted_text,parse_metadata,warnings,parser_version,error_code,created_at FROM source_documents WHERE id=$1 AND workspace_id=$2 AND status<>'deleted'`,
      [id, principal.workspaceId],
    );
    if (!result.rows[0]) throw new SourceNotFoundError();
    return result.rows[0];
  }

  public async deleteWithArtifacts(
    principal: WorkspacePrincipal,
    id: string,
    removeArtifacts: (storageKey: string) => Promise<void>,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`extract:${principal.workspaceId}:${id}`],
      );
      const source = await client.query<{ storage_key: string }>(
        `SELECT storage_key FROM source_documents WHERE id=$1 AND workspace_id=$2 AND status<>'deleted' FOR UPDATE`,
        [id, principal.workspaceId],
      );
      if (!source.rows[0]) throw new SourceNotFoundError();
      const pending = await client.query(
        `SELECT 1 FROM extraction_batches WHERE source_document_id=$1 AND workspace_id=$2 AND status='pending' LIMIT 1`,
        [id, principal.workspaceId],
      );
      if (pending.rowCount) throw new SourceDependencyError();
      await removeArtifacts(source.rows[0].storage_key);
      await client.query(
        `UPDATE source_documents SET status='deleted',extracted_text=NULL,deleted_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2`,
        [id, principal.workspaceId],
      );
      await client.query(
        `INSERT INTO audit_events (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata)
         VALUES ($1,$2,'source.delete','source_document',$3,'succeeded',$4,'{}'::jsonb)`,
        [principal.workspaceId, principal.userId, id, crypto.randomUUID()],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async audit(
    principal: WorkspacePrincipal,
    action: string,
    targetId: string,
    metadata: Record<string, string | number | boolean | null> = {},
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata)
       VALUES ($1,$2,$3,'source_document',$4,'succeeded',$5,$6::jsonb)`,
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
}
