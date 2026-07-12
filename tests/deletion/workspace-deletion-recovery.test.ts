// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Pool } from "@/infrastructure/database/sqlite-pool";
import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../helpers/sqlite-test-database";
import {
  type WorkspacePrincipal,
  workspaceIsFrozenOrMissing,
} from "@/modules/auth/workspace-access";
import { runDeletionMaintenanceCycle } from "@/modules/privacy/maintenance";
import { DeletionTombstoneStore } from "@/modules/privacy/tombstone-store";
import { WorkspaceDeletionService } from "@/modules/privacy/workspace-deletion-service";

let database: SqliteTestDatabase;
let pool: Pool;
let artifactRoot: string;
let parserRoot: string;
let fetchRoot: string;

async function principal(label: string): Promise<WorkspacePrincipal> {
  const user = await pool.query<{ id: string }>(
    "INSERT INTO users (email,name) VALUES ($1,$2) RETURNING id",
    [`${label}@example.test`, label],
  );
  const workspace = await pool.query<{ id: string }>(
    "INSERT INTO workspaces (owner_user_id,name) VALUES ($1,$2) RETURNING id",
    [user.rows[0]!.id, `${label} workspace`],
  );
  await pool.query(
    "INSERT INTO workspace_memberships (workspace_id,user_id) VALUES ($1,$2)",
    [workspace.rows[0]!.id, user.rows[0]!.id],
  );
  await pool.query(
    "INSERT INTO career_profiles (workspace_id,display_name) VALUES ($1,$2)",
    [workspace.rows[0]!.id, label],
  );
  return {
    authenticatedAt: new Date(),
    mode: "trusted-local",
    userId: user.rows[0]!.id,
    workspaceId: workspace.rows[0]!.id,
  };
}

function service() {
  return new WorkspaceDeletionService(pool, {
    ARTIFACT_STORAGE_ROOT: artifactRoot,
    PARSER_QUEUE_ROOT: parserRoot,
    JOB_FETCH_QUEUE_ROOT: fetchRoot,
  });
}

beforeAll(async () => {
  database = await createSqliteTestDatabase("deletion-recovery");
  pool = database.pool;
  artifactRoot = await mkdtemp(
    path.join(os.tmpdir(), "vitae-delete-artifacts-"),
  );
  parserRoot = await mkdtemp(path.join(os.tmpdir(), "vitae-delete-parser-"));
  fetchRoot = await mkdtemp(path.join(os.tmpdir(), "vitae-delete-fetch-"));
}, 120_000);

afterAll(async () => {
  await database?.cleanup();
  for (const root of [artifactRoot, parserRoot, fetchRoot])
    if (root) await rm(root, { recursive: true, force: true });
});

describe("workspace deletion recovery", () => {
  it("writes the replay ledger before processing and reconciles a crash after erasure", async () => {
    const actor = await principal("durable-delete");
    const deletion = service();
    await expect(deletion.preview(actor)).resolves.toMatchObject({
      managedRecordCount: expect.any(Number),
      sourceFileCount: 0,
      exportArtifactCount: 0,
    });
    const requested = await deletion.request(actor);

    expect(
      await new DeletionTombstoneStore(artifactRoot).has(actor.workspaceId),
    ).toBe(true);
    await expect(
      workspaceIsFrozenOrMissing(pool, actor.workspaceId),
    ).resolves.toBe(true);
    expect((await deletion.process(requested.operationId)).state).toBe(
      "succeeded",
    );

    await pool.query(
      `UPDATE workspace_deletion_operations
       SET state='running',completed_at=NULL,updated_at=now()
       WHERE id=$1`,
      [requested.operationId],
    );
    expect(await deletion.reconcileTombstones()).toBeGreaterThan(0);
    expect(
      await pool.query<{ state: string; completed_at: Date | null }>(
        "SELECT state,completed_at FROM workspace_deletion_operations WHERE id=$1",
        [requested.operationId],
      ),
    ).toMatchObject({
      rows: [{ state: "succeeded", completed_at: expect.any(Date) }],
    });
  });

  it("backs failed work off and resumes it through the maintenance queue", async () => {
    const actor = await principal("retry-delete");
    const deletion = service();
    const requested = await deletion.request(actor);
    const internals = deletion as unknown as {
      tombstones: { put: () => Promise<void> };
    };
    const originalPut = internals.tombstones.put.bind(internals.tombstones);
    internals.tombstones.put = async () => {
      throw Object.assign(new Error("synthetic tombstone failure"), {
        code: "EIO",
      });
    };
    expect((await deletion.process(requested.operationId)).state).toBe(
      "failed",
    );
    await expect(deletion.processNext()).resolves.toBeNull();

    internals.tombstones.put = originalPut;
    await pool.query(
      `UPDATE workspace_deletion_operations
       SET updated_at=now()-interval '2 minutes' WHERE id=$1`,
      [requested.operationId],
    );
    const cycle = await runDeletionMaintenanceCycle(deletion);
    expect(cycle).toMatchObject({ processed: 1, failed: 0 });
    await expect(
      workspaceIsFrozenOrMissing(pool, actor.workspaceId),
    ).resolves.toBe(true);
  });
});
