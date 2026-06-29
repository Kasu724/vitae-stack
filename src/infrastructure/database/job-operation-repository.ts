import type { Pool } from "pg";

export interface LeasedJobOperation {
  id: string;
  workspaceId: string;
  operationType: string;
  inputHash: string;
  attempt: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
}

interface JobOperationRow {
  id: string;
  workspace_id: string;
  operation_type: string;
  input_hash: string;
  attempt: number;
  max_attempts: number;
  lease_owner: string;
  lease_expires_at: Date;
}

function mapLeasedOperation(row: JobOperationRow): LeasedJobOperation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    operationType: row.operation_type,
    inputHash: row.input_hash,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
  };
}

export class JobOperationRepository {
  public constructor(private readonly pool: Pool) {}

  public async leaseNext(
    workerId: string,
    leaseDurationMs: number,
  ): Promise<LeasedJobOperation | undefined> {
    if (workerId.length === 0 || leaseDurationMs < 1) {
      throw new Error("A worker ID and positive lease duration are required.");
    }

    const result = await this.pool.query<JobOperationRow>(
      `WITH candidate AS (
         SELECT id
         FROM job_operations
         WHERE state = 'pending'
           AND available_at <= now()
           AND attempt < max_attempts
         ORDER BY available_at, created_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE job_operations AS operation
       SET state = 'running',
           attempt = operation.attempt + 1,
           lease_owner = $1,
           lease_expires_at = now() + ($2 * interval '1 millisecond'),
           started_at = COALESCE(operation.started_at, now()),
           updated_at = now()
       FROM candidate
       WHERE operation.id = candidate.id
       RETURNING operation.id,
                 operation.workspace_id,
                 operation.operation_type,
                 operation.input_hash,
                 operation.attempt,
                 operation.max_attempts,
                 operation.lease_owner,
                 operation.lease_expires_at`,
      [workerId, leaseDurationMs],
    );

    const row = result.rows[0];
    return row ? mapLeasedOperation(row) : undefined;
  }

  public async markSucceeded(input: {
    id: string;
    workspaceId: string;
    workerId: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE job_operations
       SET state = 'succeeded',
           lease_owner = NULL,
           lease_expires_at = NULL,
           completed_at = now(),
           updated_at = now()
       WHERE id = $1
         AND workspace_id = $2
         AND state = 'running'
         AND lease_owner = $3`,
      [input.id, input.workspaceId, input.workerId],
    );

    return result.rowCount === 1;
  }
}
