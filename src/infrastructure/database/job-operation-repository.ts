import type { Pool } from "./sqlite-pool";

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
      `UPDATE job_operations
       SET state = 'running',
           attempt = attempt + 1,
           lease_owner = $1,
           lease_expires_at = now() + ($2 * interval '1 millisecond'),
           started_at = COALESCE(started_at, now()),
           updated_at = now()
       WHERE id = (
         SELECT id FROM job_operations
         WHERE state='pending' AND available_at<=now() AND attempt<max_attempts
         ORDER BY available_at,created_at,id LIMIT 1
       )
       RETURNING id,workspace_id,operation_type,input_hash,attempt,max_attempts,lease_owner,lease_expires_at`,
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
