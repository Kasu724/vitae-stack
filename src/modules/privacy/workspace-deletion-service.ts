import { createHash } from "node:crypto";

import type { Pool } from "@/infrastructure/database/sqlite-pool";

import { FilesystemArtifactStore } from "@/infrastructure/artifacts/filesystem-store";
import type { ServerEnvironment } from "@/infrastructure/config/environment-schema";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { requireRecentAuthentication } from "@/modules/auth/workspace-access";
import { jobFetchMessageKey } from "@/modules/job-fetch/protocol";
import { PORTABLE_TABLES } from "@/modules/portability/domain";
import {
  APPLICATION_RATE_LIMIT_SCOPES,
  applicationRateLimitKey,
} from "@/infrastructure/security/rate-limit";

import { DeletionTombstoneStore } from "./tombstone-store";

export interface WorkspaceDeletionReceipt {
  operationId: string;
  workspaceId: string;
  state: "pending" | "running" | "succeeded" | "failed";
  requestedAt: Date;
  completedAt: Date | null;
  backupExpiresAt: Date;
  deletedCounts: Record<string, number>;
  errorCode: string | null;
}

export interface WorkspaceDeletionPreview {
  managedRecordCount: number;
  sourceFileCount: number;
  exportArtifactCount: number;
  queuedJobCount: number;
}

interface OperationRow {
  id: string;
  workspace_id: string;
  state: WorkspaceDeletionReceipt["state"];
  requested_at: Date;
  completed_at: Date | null;
  backup_expires_at: Date;
  deleted_counts: Record<string, number>;
  error_code: string | null;
}

function receipt(row: OperationRow): WorkspaceDeletionReceipt {
  return {
    operationId: row.id,
    workspaceId: row.workspace_id,
    state: row.state,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    backupExpiresAt: row.backup_expires_at,
    deletedCounts: row.deleted_counts,
    errorCode: row.error_code,
  };
}

export class WorkspaceDeletionService {
  private readonly artifacts: FilesystemArtifactStore;
  private readonly parserQueue: FilesystemArtifactStore;
  private readonly fetchQueue: FilesystemArtifactStore;
  private readonly tombstones: DeletionTombstoneStore;

  public constructor(
    private readonly pool: Pool,
    environment: Pick<
      ServerEnvironment,
      "ARTIFACT_STORAGE_ROOT" | "PARSER_QUEUE_ROOT" | "JOB_FETCH_QUEUE_ROOT"
    >,
  ) {
    this.artifacts = new FilesystemArtifactStore(
      environment.ARTIFACT_STORAGE_ROOT,
    );
    this.parserQueue = new FilesystemArtifactStore(
      environment.PARSER_QUEUE_ROOT,
    );
    this.fetchQueue = new FilesystemArtifactStore(
      environment.JOB_FETCH_QUEUE_ROOT,
    );
    this.tombstones = new DeletionTombstoneStore(
      environment.ARTIFACT_STORAGE_ROOT,
    );
  }

  public async reconcileTombstones(): Promise<number> {
    let replayed = 0;
    for (const tombstone of await this.tombstones.list()) {
      const workspace = await this.pool.query(
        "SELECT 1 FROM workspaces WHERE id=$1",
        [tombstone.workspaceId],
      );
      if (!workspace.rowCount) {
        await this.pool.query(
          `UPDATE workspace_deletion_operations SET state='succeeded',
             completed_at=COALESCE(completed_at,now()),updated_at=now(),error_code=NULL
           WHERE id=$1 OR workspace_id=$2`,
          [tombstone.operationId, tombstone.workspaceId],
        );
        replayed += 1;
        continue;
      }
      await this.pool.query(
        `UPDATE workspaces SET deletion_requested_at=COALESCE(deletion_requested_at,$2),updated_at=now()
         WHERE id=$1`,
        [tombstone.workspaceId, tombstone.requestedAt],
      );
      await this.pool.query(
        `INSERT INTO workspace_deletion_operations
           (id,workspace_id,requester_user_hash,state,backup_expires_at,requested_at)
         VALUES ($1,$2,$3,'pending',$4,$5)
         ON CONFLICT (workspace_id) DO UPDATE SET
           id=excluded.id,
           requester_user_hash=excluded.requester_user_hash,
           backup_expires_at=excluded.backup_expires_at,
           requested_at=excluded.requested_at,
           state=CASE WHEN workspace_deletion_operations.state='succeeded' THEN 'pending'
                      ELSE workspace_deletion_operations.state END,
           updated_at=now()`,
        [
          tombstone.operationId,
          tombstone.workspaceId,
          tombstone.requesterUserHash,
          tombstone.backupExpiresAt,
          tombstone.requestedAt,
        ],
      );
      replayed += 1;
    }
    return replayed;
  }

  public async cleanupExpiredAndOrphanedArtifacts(): Promise<{
    expired: number;
    orphaned: number;
  }> {
    const expired = await this.pool.query<{ id: string; storage_key: string }>(
      `SELECT a.id,a.storage_key FROM export_artifacts a
       JOIN workspaces w ON w.id=a.workspace_id
       WHERE a.expires_at<=now() AND w.deletion_requested_at IS NULL`,
    );
    for (const artifact of expired.rows)
      await this.artifacts.delete(artifact.storage_key);
    if (expired.rows.length)
      await this.pool.query(
        `DELETE FROM export_artifacts WHERE id=ANY($1::uuid[]) AND expires_at<=now()
         AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=export_artifacts.workspace_id
                     AND w.deletion_requested_at IS NULL)`,
        [expired.rows.map((row) => row.id)],
      );

    const known = await this.pool.query<{ storage_key: string }>(
      `SELECT storage_key FROM source_documents WHERE status<>'deleted'
       UNION SELECT storage_key FROM export_artifacts WHERE expires_at>now()`,
    );
    const knownKeys = new Set(known.rows.map((row) => row.storage_key));
    const oldKeys = await this.artifacts.listKeysOlderThan(24 * 60 * 60 * 1000);
    const orphaned = oldKeys.filter((key) => !knownKeys.has(key));
    await Promise.all(orphaned.map((key) => this.artifacts.delete(key)));
    return { expired: expired.rows.length, orphaned: orphaned.length };
  }

  public async preview(
    principal: WorkspacePrincipal,
  ): Promise<WorkspaceDeletionPreview> {
    const [portableCounts, sourceFiles, exportArtifacts, queuedJobs] =
      await Promise.all([
        Promise.all(
          PORTABLE_TABLES.map(async (table) => {
            const result = await this.pool.query<{ count: number }>(
              `SELECT count(*) count FROM "${table}" WHERE workspace_id=$1`,
              [principal.workspaceId],
            );
            return Number(result.rows[0]?.count ?? 0);
          }),
        ),
        this.pool.query<{ count: number }>(
          "SELECT count(*) count FROM source_documents WHERE workspace_id=$1 AND status<>'deleted'",
          [principal.workspaceId],
        ),
        this.pool.query<{ count: number }>(
          "SELECT count(*) count FROM export_artifacts WHERE workspace_id=$1",
          [principal.workspaceId],
        ),
        this.pool.query<{ count: number }>(
          `SELECT (SELECT count(*) FROM job_operations WHERE workspace_id=$1)
                  +(SELECT count(*) FROM job_url_imports WHERE workspace_id=$1) count`,
          [principal.workspaceId],
        ),
      ]);
    return {
      managedRecordCount: portableCounts.reduce((sum, count) => sum + count, 0),
      sourceFileCount: Number(sourceFiles.rows[0]?.count ?? 0),
      exportArtifactCount: Number(exportArtifacts.rows[0]?.count ?? 0),
      queuedJobCount: Number(queuedJobs.rows[0]?.count ?? 0),
    };
  }

  public async request(
    principal: WorkspacePrincipal,
  ): Promise<WorkspaceDeletionReceipt> {
    requireRecentAuthentication(principal);
    const requesterUserHash = createHash("sha256")
      .update(principal.userId)
      .digest("hex");
    const client = await this.pool.connect();
    let requested: WorkspaceDeletionReceipt;
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`workspace-delete:${principal.workspaceId}`],
      );
      const existing = await client.query<OperationRow>(
        `SELECT id,workspace_id,state,requested_at,completed_at,backup_expires_at,deleted_counts,error_code
         FROM workspace_deletion_operations WHERE workspace_id=$1`,
        [principal.workspaceId],
      );
      if (existing.rows[0]) {
        requested = receipt(existing.rows[0]);
      } else {
        const frozen = await client.query(
          `UPDATE workspaces SET deletion_requested_at=now(),updated_at=now()
           WHERE id=$1 AND deletion_requested_at IS NULL`,
          [principal.workspaceId],
        );
        if (!frozen.rowCount) throw new Error("WORKSPACE_UNAVAILABLE");
        const created = await client.query<OperationRow>(
          `INSERT INTO workspace_deletion_operations
             (workspace_id,requester_user_hash,backup_expires_at)
           VALUES ($1,$2,now())
           RETURNING id,workspace_id,state,requested_at,completed_at,backup_expires_at,deleted_counts,error_code`,
          [principal.workspaceId, requesterUserHash],
        );
        requested = receipt(created.rows[0]!);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await this.tombstones.put({
      schemaVersion: 1,
      operationId: requested.operationId,
      workspaceId: requested.workspaceId,
      requesterUserHash,
      requestedAt: requested.requestedAt.toISOString(),
      backupExpiresAt: requested.backupExpiresAt.toISOString(),
    });
    return requested;
  }

  public async processNext(): Promise<WorkspaceDeletionReceipt | null> {
    const claimed = await this.pool.query<OperationRow>(
      `UPDATE workspace_deletion_operations operation SET
         state='running',attempt=attempt+1,started_at=COALESCE(started_at,now()),
         updated_at=now(),error_code=NULL
       WHERE operation.id=(
         SELECT id FROM workspace_deletion_operations
         WHERE (state='pending'
                OR (state='failed' AND updated_at<now()-interval '1 minute')
                OR (state='running' AND updated_at<now()-interval '30 minutes'))
         ORDER BY requested_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       RETURNING id,workspace_id,state,requested_at,completed_at,backup_expires_at,deleted_counts,error_code`,
    );
    const operation = claimed.rows[0];
    if (!operation) return null;
    return this.process(operation.id, true);
  }

  public async process(
    operationId: string,
    alreadyClaimed = false,
  ): Promise<WorkspaceDeletionReceipt> {
    const operationResult = await this.pool.query<OperationRow>(
      `SELECT id,workspace_id,state,requested_at,completed_at,backup_expires_at,deleted_counts,error_code
       FROM workspace_deletion_operations WHERE id=$1`,
      [operationId],
    );
    const operation = operationResult.rows[0];
    if (!operation) throw new Error("DELETION_OPERATION_NOT_FOUND");
    if (operation.state === "succeeded") return receipt(operation);
    if (operation.state === "running" && !alreadyClaimed)
      return receipt(operation);
    if (operation.state !== "running") {
      const claimed = await this.pool.query<OperationRow>(
        `UPDATE workspace_deletion_operations SET state='running',attempt=attempt+1,
           started_at=COALESCE(started_at,now()),updated_at=now(),error_code=NULL
         WHERE id=$1 AND (state='pending'
              OR (state='failed' AND updated_at<now()-interval '1 minute'))
         RETURNING id,workspace_id,state,requested_at,completed_at,backup_expires_at,deleted_counts,error_code`,
        [operationId],
      );
      if (!claimed.rows[0]) {
        const current = await this.pool.query<OperationRow>(
          `SELECT id,workspace_id,state,requested_at,completed_at,backup_expires_at,deleted_counts,error_code
           FROM workspace_deletion_operations WHERE id=$1`,
          [operationId],
        );
        if (current.rows[0]) return receipt(current.rows[0]);
        throw new Error("DELETION_OPERATION_UNAVAILABLE");
      }
    }

    try {
      const requester = await this.pool.query<{ requester_user_hash: string }>(
        "SELECT requester_user_hash FROM workspace_deletion_operations WHERE id=$1",
        [operationId],
      );
      await this.tombstones.put({
        schemaVersion: 1,
        operationId: operation.id,
        workspaceId: operation.workspace_id,
        requesterUserHash: requester.rows[0]!.requester_user_hash,
        requestedAt: operation.requested_at.toISOString(),
        backupExpiresAt: operation.backup_expires_at.toISOString(),
      });
      const [sources, artifacts, fetches, owner] = await Promise.all([
        this.pool.query<{ storage_key: string; id: string }>(
          "SELECT id,storage_key FROM source_documents WHERE workspace_id=$1",
          [operation.workspace_id],
        ),
        this.pool.query<{ storage_key: string }>(
          "SELECT storage_key FROM export_artifacts WHERE workspace_id=$1",
          [operation.workspace_id],
        ),
        this.pool.query<{ operation_id: string }>(
          "SELECT operation_id FROM job_url_imports WHERE workspace_id=$1",
          [operation.workspace_id],
        ),
        this.pool.query<{ owner_user_id: string }>(
          "SELECT owner_user_id FROM workspaces WHERE id=$1",
          [operation.workspace_id],
        ),
      ]);
      await Promise.all([
        ...sources.rows.flatMap((source) => [
          this.artifacts.delete(source.storage_key),
          this.parserQueue.delete(
            `${operation.workspace_id}/${source.id}.json`,
          ),
        ]),
        ...artifacts.rows.map((artifact) =>
          this.artifacts.delete(artifact.storage_key),
        ),
        ...fetches.rows.map((item) =>
          this.fetchQueue.delete(
            jobFetchMessageKey(operation.workspace_id, item.operation_id),
          ),
        ),
      ]);

      const counts: Record<string, number> = {
        artifactFiles: sources.rows.length + artifacts.rows.length,
        queueFiles: sources.rows.length + fetches.rows.length,
      };
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        // Several immutable history tables contain self-references (for
        // example, a derived claim points at its source claim). Defer FK
        // evaluation so the complete workspace aggregate can be erased in
        // one transaction without mutating immutable rows first.
        await client.query("PRAGMA defer_foreign_keys=ON");
        client.authorizeWorkspaceDeletion();
        const urlImports = await client.query(
          "DELETE FROM job_url_imports WHERE workspace_id=$1",
          [operation.workspace_id],
        );
        counts.job_url_imports = urlImports.rowCount ?? 0;
        for (const table of [...PORTABLE_TABLES].reverse()) {
          const deleted = await client.query(
            `DELETE FROM "${table}" WHERE workspace_id=$1`,
            [operation.workspace_id],
          );
          counts[table] = deleted.rowCount ?? 0;
        }
        for (const table of ["audit_events", "job_operations"] as const) {
          const deleted = await client.query(
            `DELETE FROM "${table}" WHERE workspace_id=$1`,
            [operation.workspace_id],
          );
          counts[table] = deleted.rowCount ?? 0;
        }
        await client.query(
          "DELETE FROM workspace_memberships WHERE workspace_id=$1",
          [operation.workspace_id],
        );
        await client.query("DELETE FROM workspaces WHERE id=$1", [
          operation.workspace_id,
        ]);
        if (owner.rows[0])
          await client.query(
            "DELETE FROM rate_limits WHERE key=ANY($1::text[])",
            [
              APPLICATION_RATE_LIMIT_SCOPES.map((scope) =>
                applicationRateLimitKey(scope, owner.rows[0]!.owner_user_id),
              ),
            ],
          );
        if (owner.rows[0])
          await client.query(
            `DELETE FROM users u WHERE u.id=$1
             AND NOT EXISTS (SELECT 1 FROM workspace_memberships m WHERE m.user_id=u.id)`,
            [owner.rows[0].owner_user_id],
          );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      const completed = await this.pool.query<OperationRow>(
        `UPDATE workspace_deletion_operations SET state='succeeded',completed_at=now(),
           updated_at=now(),deleted_counts=$2::jsonb,error_code=NULL
         WHERE id=$1
         RETURNING id,workspace_id,state,requested_at,completed_at,backup_expires_at,deleted_counts,error_code`,
        [operationId, JSON.stringify(counts)],
      );
      return receipt(completed.rows[0]!);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "workspace.delete.failed",
          constraint:
            typeof error === "object" &&
            error !== null &&
            "constraint" in error &&
            typeof error.constraint === "string"
              ? error.constraint
              : undefined,
          errorCode:
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof error.code === "string"
              ? error.code
              : "UNCLASSIFIED",
          table:
            typeof error === "object" &&
            error !== null &&
            "table" in error &&
            typeof error.table === "string"
              ? error.table
              : undefined,
        }),
      );
      const failed = await this.pool.query<OperationRow>(
        `UPDATE workspace_deletion_operations SET state='failed',updated_at=now(),
           error_code='DELETE_RETRY_REQUIRED'
         WHERE id=$1
         RETURNING id,workspace_id,state,requested_at,completed_at,backup_expires_at,deleted_counts,error_code`,
        [operationId],
      );
      return receipt(failed.rows[0]!);
    }
  }
}
