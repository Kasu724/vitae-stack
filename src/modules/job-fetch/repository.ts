import { createHash } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";

export class JobUrlImportNotFoundError extends Error {
  public constructor() {
    super("The requested URL import is unavailable.");
    this.name = "JobUrlImportNotFoundError";
  }
}

export class JobUrlRateLimitError extends Error {
  public constructor() {
    super("The URL import rate limit was reached.");
    this.name = "JobUrlRateLimitError";
  }
}

export interface JobUrlImportRecord {
  id: string;
  operation_id: string;
  title: string;
  company: string | null;
  requested_url: string;
  status: "pending" | "succeeded" | "failed";
  job_posting_id: string | null;
  error_code: string | null;
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

export class JobUrlImportRepository {
  public constructor(private readonly pool: Pool) {}

  public async create(
    principal: WorkspacePrincipal,
    input: {
      title: string;
      company: string | null;
      requestedUrl: string;
      idempotencyKey: string;
    },
  ): Promise<JobUrlImportRecord> {
    return transaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`job-url-rate:${principal.workspaceId}`],
      );
      const prior = await client.query<JobUrlImportRecord>(
        `SELECT i.id,i.operation_id,i.title,i.company,i.requested_url,i.status,i.job_posting_id,i.error_code,i.created_at
         FROM job_url_imports i JOIN job_operations o ON o.id=i.operation_id AND o.workspace_id=i.workspace_id
         WHERE i.workspace_id=$1 AND o.idempotency_key=$2 LIMIT 1`,
        [principal.workspaceId, input.idempotencyKey],
      );
      if (prior.rows[0]) return prior.rows[0];
      const recent = await client.query<{ count: string }>(
        `SELECT count(*)::text count FROM job_url_imports WHERE workspace_id=$1 AND created_at>now()-interval '1 hour'`,
        [principal.workspaceId],
      );
      if (Number(recent.rows[0]!.count) >= 10) throw new JobUrlRateLimitError();
      const inputHash = `sha256:${createHash("sha256")
        .update(input.requestedUrl)
        .digest("hex")}`;
      const operation = await client.query<{ id: string }>(
        `INSERT INTO job_operations (workspace_id,operation_type,idempotency_key,input_hash,max_attempts) VALUES ($1,'job_url_fetch',$2,$3,1) RETURNING id`,
        [principal.workspaceId, input.idempotencyKey, inputHash],
      );
      const created = await client.query<JobUrlImportRecord>(
        `INSERT INTO job_url_imports (workspace_id,operation_id,requested_by_user_id,title,company,requested_url)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id,operation_id,title,company,requested_url,status,job_posting_id,error_code,created_at`,
        [
          principal.workspaceId,
          operation.rows[0]!.id,
          principal.userId,
          input.title,
          input.company,
          input.requestedUrl,
        ],
      );
      await client.query(
        `INSERT INTO audit_events (workspace_id,actor_user_id,job_operation_id,action,target_type,target_id,outcome,correlation_id,metadata)
         VALUES ($1,$2,$3,'job-url.request','job_url_import',$4,'succeeded',$5,'{}'::jsonb)`,
        [
          principal.workspaceId,
          principal.userId,
          operation.rows[0]!.id,
          created.rows[0]!.id,
          crypto.randomUUID(),
        ],
      );
      return created.rows[0]!;
    });
  }

  public async get(
    principal: WorkspacePrincipal,
    id: string,
  ): Promise<JobUrlImportRecord> {
    const result = await this.pool.query<JobUrlImportRecord>(
      `SELECT id,operation_id,title,company,requested_url,status,job_posting_id,error_code,created_at FROM job_url_imports WHERE id=$1 AND workspace_id=$2`,
      [id, principal.workspaceId],
    );
    if (!result.rows[0]) throw new JobUrlImportNotFoundError();
    return result.rows[0];
  }

  public async succeed(
    principal: WorkspacePrincipal,
    id: string,
    jobPostingId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query<{ operation_id: string }>(
        `UPDATE job_url_imports SET status='succeeded',job_posting_id=$3,completed_at=now(),updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND status='pending' RETURNING operation_id`,
        [id, principal.workspaceId, jobPostingId],
      );
      if (!result.rows[0]) return;
      await client.query(
        `UPDATE job_operations SET state='succeeded',completed_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2 AND state='pending'`,
        [result.rows[0].operation_id, principal.workspaceId],
      );
    });
  }

  public async fail(
    principal: WorkspacePrincipal,
    id: string,
    errorCode: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query<{ operation_id: string }>(
        `UPDATE job_url_imports SET status='failed',error_code=$3,completed_at=now(),updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND status='pending' RETURNING operation_id`,
        [id, principal.workspaceId, errorCode.slice(0, 100)],
      );
      if (!result.rows[0]) return;
      await client.query(
        `UPDATE job_operations SET state='failed',error_code=$3,completed_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2 AND state='pending'`,
        [
          result.rows[0].operation_id,
          principal.workspaceId,
          errorCode.slice(0, 100),
        ],
      );
    });
  }
}
