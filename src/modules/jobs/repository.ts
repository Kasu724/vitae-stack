import type { Pool, PoolClient } from "pg";

import type { JobRevisionMetadata } from "../../../db/schema/jobs";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import type { FetchedJobDescription } from "@/modules/job-fetch/fetcher";

import {
  jobMetadataInputSchema,
  normalizeJobText,
  pastedJobInputSchema,
} from "./domain";

export class JobNotFoundError extends Error {
  public constructor() {
    super("The requested job is unavailable.");
    this.name = "JobNotFoundError";
  }
}

export class JobConflictError extends Error {
  public constructor() {
    super("This job changed in another session. Reload before saving.");
    this.name = "JobConflictError";
  }
}

export interface JobPostingRecord {
  id: string;
  title: string;
  company: string | null;
  status: "active" | "archived";
  revision: number;
  updated_at: Date;
  current_revision_id: string;
  current_revision_number: number;
}

export interface JobRevisionRecord {
  id: string;
  job_posting_id: string;
  parent_revision_id: string | null;
  source_document_id: string | null;
  source_available: boolean;
  input_method: "text" | "file" | "url";
  revision_number: number;
  normalized_text: string;
  content_hash: string;
  metadata: JobRevisionMetadata;
  created_at: Date;
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
  metadata: Record<string, string | number | boolean | null>,
) {
  await client.query(
    `INSERT INTO audit_events (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata) VALUES ($1,$2,$3,'job_posting',$4,'succeeded',$5,$6::jsonb)`,
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

export class JobRepository {
  public constructor(private readonly pool: Pool) {}

  public async list(
    principal: WorkspacePrincipal,
    status: "active" | "archived" = "active",
  ): Promise<JobPostingRecord[]> {
    const result = await this.pool.query<JobPostingRecord>(
      `SELECT j.id,j.title,j.company,j.status,j.revision,j.updated_at,r.id current_revision_id,r.revision_number current_revision_number
       FROM job_postings j
       JOIN LATERAL (SELECT id,revision_number FROM job_posting_revisions WHERE job_posting_id=j.id AND workspace_id=j.workspace_id ORDER BY revision_number DESC LIMIT 1) r ON true
       WHERE j.workspace_id=$1 AND j.status=$2 ORDER BY j.updated_at DESC,j.id`,
      [principal.workspaceId, status],
    );
    return result.rows;
  }

  public async createFromText(
    principal: WorkspacePrincipal,
    raw: {
      title: string;
      company: string;
      text: string;
      idempotencyKey?: string;
    },
  ): Promise<string> {
    const input = pastedJobInputSchema.parse(raw);
    const normalized = normalizeJobText(input.text);
    return transaction(this.pool, async (client) => {
      if (raw.idempotencyKey) {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`job-create:${principal.workspaceId}:${raw.idempotencyKey}`],
        );
        const prior = await client.query<{ target_id: string }>(
          `SELECT target_id FROM audit_events WHERE workspace_id=$1 AND action='job.create' AND metadata->>'idempotencyKey'=$2 LIMIT 1`,
          [principal.workspaceId, raw.idempotencyKey],
        );
        if (prior.rows[0]) return prior.rows[0].target_id;
      }
      const posting = await client.query<{ id: string }>(
        `INSERT INTO job_postings (workspace_id,title,company) VALUES ($1,$2,$3) RETURNING id`,
        [principal.workspaceId, input.title, input.company],
      );
      const id = posting.rows[0]!.id;
      const revision = await client.query<{ id: string }>(
        `INSERT INTO job_posting_revisions (workspace_id,job_posting_id,input_method,revision_number,normalized_text,content_hash,metadata,created_by_user_id) VALUES ($1,$2,'text',1,$3,$4,$5::jsonb,$6) RETURNING id`,
        [
          principal.workspaceId,
          id,
          normalized.text,
          normalized.hash,
          JSON.stringify({ schemaVersion: 1, warnings: normalized.warnings }),
          principal.userId,
        ],
      );
      await audit(client, principal, "job.create", id, {
        inputMethod: "text",
        idempotencyKey: raw.idempotencyKey ?? null,
        revisionId: revision.rows[0]!.id,
        wordCount: normalized.wordCount,
      });
      return id;
    });
  }

  public async createFromSource(
    principal: WorkspacePrincipal,
    sourceId: string,
    raw: { title: string; company: string },
  ): Promise<string> {
    const input = jobMetadataInputSchema.parse(raw);
    return transaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`job-source:${principal.workspaceId}:${sourceId}`],
      );
      const prior = await client.query<{ job_posting_id: string }>(
        `SELECT job_posting_id FROM job_posting_revisions WHERE workspace_id=$1 AND source_document_id=$2 ORDER BY revision_number LIMIT 1`,
        [principal.workspaceId, sourceId],
      );
      if (prior.rows[0]) return prior.rows[0].job_posting_id;
      const source = await client.query<{
        original_name: string;
        detected_media_type: string;
        extracted_text: string;
        warnings: string[];
      }>(
        `SELECT original_name,detected_media_type,extracted_text,warnings FROM source_documents WHERE id=$1 AND workspace_id=$2 AND purpose='job_description' AND status='ready' FOR UPDATE`,
        [sourceId, principal.workspaceId],
      );
      const row = source.rows[0];
      if (!row) throw new JobNotFoundError();
      const normalized = normalizeJobText(row.extracted_text);
      const posting = await client.query<{ id: string }>(
        `INSERT INTO job_postings (workspace_id,title,company) VALUES ($1,$2,$3) RETURNING id`,
        [principal.workspaceId, input.title, input.company],
      );
      const id = posting.rows[0]!.id;
      const metadata: JobRevisionMetadata = {
        schemaVersion: 1,
        warnings: [...new Set([...row.warnings, ...normalized.warnings])],
        sourceName: row.original_name,
        sourceMediaType: row.detected_media_type,
      };
      const revision = await client.query<{ id: string }>(
        `INSERT INTO job_posting_revisions (workspace_id,job_posting_id,source_document_id,input_method,revision_number,normalized_text,content_hash,metadata,created_by_user_id) VALUES ($1,$2,$3,'file',1,$4,$5,$6::jsonb,$7) RETURNING id`,
        [
          principal.workspaceId,
          id,
          sourceId,
          normalized.text,
          normalized.hash,
          JSON.stringify(metadata),
          principal.userId,
        ],
      );
      await audit(client, principal, "job.create", id, {
        inputMethod: "file",
        revisionId: revision.rows[0]!.id,
        sourceId,
        wordCount: normalized.wordCount,
      });
      return id;
    });
  }

  public async createFromUrl(
    principal: WorkspacePrincipal,
    raw: { title: string; company: string },
    fetched: FetchedJobDescription,
    operationId: string,
  ): Promise<string> {
    const input = jobMetadataInputSchema.parse(raw);
    const normalized = normalizeJobText(fetched.text);
    return transaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`job-url:${principal.workspaceId}:${operationId}`],
      );
      const prior = await client.query<{ target_id: string }>(
        `SELECT target_id FROM audit_events WHERE workspace_id=$1 AND action='job.create' AND metadata->>'operationId'=$2 LIMIT 1`,
        [principal.workspaceId, operationId],
      );
      if (prior.rows[0]) return prior.rows[0].target_id;
      const posting = await client.query<{ id: string }>(
        `INSERT INTO job_postings (workspace_id,title,company) VALUES ($1,$2,$3) RETURNING id`,
        [principal.workspaceId, input.title, input.company],
      );
      const id = posting.rows[0]!.id;
      const metadata: JobRevisionMetadata = {
        schemaVersion: 1,
        warnings: normalized.warnings,
        retrieval: {
          requestedUrl: fetched.requestedUrl,
          finalOrigin: fetched.finalOrigin,
          retrievedAt: fetched.retrievedAt,
        },
      };
      const revision = await client.query<{ id: string }>(
        `INSERT INTO job_posting_revisions (workspace_id,job_posting_id,input_method,revision_number,normalized_text,content_hash,metadata,created_by_user_id) VALUES ($1,$2,'url',1,$3,$4,$5::jsonb,$6) RETURNING id`,
        [
          principal.workspaceId,
          id,
          normalized.text,
          normalized.hash,
          JSON.stringify(metadata),
          principal.userId,
        ],
      );
      await audit(client, principal, "job.create", id, {
        inputMethod: "url",
        operationId,
        revisionId: revision.rows[0]!.id,
        wordCount: normalized.wordCount,
      });
      return id;
    });
  }

  public async get(
    principal: WorkspacePrincipal,
    id: string,
  ): Promise<{ posting: JobPostingRecord; revisions: JobRevisionRecord[] }> {
    const posting = await this.pool.query<JobPostingRecord>(
      `SELECT j.id,j.title,j.company,j.status,j.revision,j.updated_at,r.id current_revision_id,r.revision_number current_revision_number
       FROM job_postings j
       JOIN LATERAL (SELECT id,revision_number FROM job_posting_revisions WHERE job_posting_id=j.id AND workspace_id=j.workspace_id ORDER BY revision_number DESC LIMIT 1) r ON true
       WHERE j.id=$1 AND j.workspace_id=$2`,
      [id, principal.workspaceId],
    );
    if (!posting.rows[0]) throw new JobNotFoundError();
    const revisions = await this.pool.query<JobRevisionRecord>(
      `SELECT r.id,r.job_posting_id,r.parent_revision_id,r.source_document_id,r.input_method,r.revision_number,r.normalized_text,r.content_hash,r.metadata,r.created_at,
              (r.source_document_id IS NOT NULL AND EXISTS (SELECT 1 FROM source_documents s WHERE s.id=r.source_document_id AND s.workspace_id=r.workspace_id AND s.status<>'deleted')) source_available
       FROM job_posting_revisions r WHERE r.job_posting_id=$1 AND r.workspace_id=$2 ORDER BY r.revision_number DESC`,
      [id, principal.workspaceId],
    );
    return { posting: posting.rows[0], revisions: revisions.rows };
  }

  public async revise(
    principal: WorkspacePrincipal,
    id: string,
    expectedRevisionId: string,
    text: string,
  ): Promise<string> {
    const normalized = normalizeJobText(text);
    return transaction(this.pool, async (client) => {
      const posting = await client.query<{ revision: number }>(
        `SELECT revision FROM job_postings WHERE id=$1 AND workspace_id=$2 FOR UPDATE`,
        [id, principal.workspaceId],
      );
      if (!posting.rows[0]) throw new JobNotFoundError();
      const current = await client.query<{
        id: string;
        revision_number: number;
      }>(
        `SELECT id,revision_number FROM job_posting_revisions WHERE job_posting_id=$1 AND workspace_id=$2 ORDER BY revision_number DESC LIMIT 1 FOR UPDATE`,
        [id, principal.workspaceId],
      );
      if (!current.rows[0] || current.rows[0].id !== expectedRevisionId)
        throw new JobConflictError();
      const revision = await client.query<{ id: string }>(
        `INSERT INTO job_posting_revisions (workspace_id,job_posting_id,parent_revision_id,input_method,revision_number,normalized_text,content_hash,metadata,created_by_user_id) VALUES ($1,$2,$3,'text',$4,$5,$6,$7::jsonb,$8) RETURNING id`,
        [
          principal.workspaceId,
          id,
          current.rows[0].id,
          current.rows[0].revision_number + 1,
          normalized.text,
          normalized.hash,
          JSON.stringify({ schemaVersion: 1, warnings: normalized.warnings }),
          principal.userId,
        ],
      );
      await client.query(
        `UPDATE job_postings SET revision=revision+1,updated_at=now() WHERE id=$1 AND workspace_id=$2`,
        [id, principal.workspaceId],
      );
      await audit(client, principal, "job.revise", id, {
        parentRevisionId: current.rows[0].id,
        revisionId: revision.rows[0]!.id,
        revisionNumber: current.rows[0].revision_number + 1,
        wordCount: normalized.wordCount,
      });
      return revision.rows[0]!.id;
    });
  }

  public async setArchived(
    principal: WorkspacePrincipal,
    id: string,
    archived: boolean,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE job_postings SET status=$3::job_posting_status,archived_at=CASE WHEN $3::text='archived' THEN now() ELSE NULL END,revision=revision+1,updated_at=now() WHERE id=$1 AND workspace_id=$2`,
      [id, principal.workspaceId, archived ? "archived" : "active"],
    );
    if (!result.rowCount) throw new JobNotFoundError();
  }
}
