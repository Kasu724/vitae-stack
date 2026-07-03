// @vitest-environment node

import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseConnection } from "@/infrastructure/database/connection";
import { JobOperationRepository } from "@/infrastructure/database/job-operation-repository";
import { migrateDatabase } from "@/infrastructure/database/migration";
import { EXPECTED_MIGRATION_COUNT } from "@/infrastructure/database/readiness";
import type { Pool } from "@/infrastructure/database/sqlite-pool";
import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../helpers/sqlite-test-database";

let testDatabase: SqliteTestDatabase;
let pool: Pool;

async function createWorkspace(label: string) {
  const user = await pool.query<{ id: string }>(
    "INSERT INTO users (email,name) VALUES ($1,$2) RETURNING id",
    [`${label}@example.test`, label],
  );
  const userId = user.rows[0]!.id;
  const workspace = await pool.query<{ id: string }>(
    "INSERT INTO workspaces (owner_user_id,name) VALUES ($1,$2) RETURNING id",
    [userId, `${label} workspace`],
  );
  const workspaceId = workspace.rows[0]!.id;
  await pool.query(
    "INSERT INTO workspace_memberships (workspace_id,user_id) VALUES ($1,$2)",
    [workspaceId, userId],
  );
  await pool.query(
    "INSERT INTO career_profiles (workspace_id,display_name) VALUES ($1,$2)",
    [workspaceId, label],
  );
  return { userId, workspaceId };
}

beforeAll(async () => {
  testDatabase = await createSqliteTestDatabase("database");
  pool = testDatabase.pool;
});

afterAll(async () => {
  await testDatabase?.cleanup();
});

describe("SQLite migrations and integrity", () => {
  it("migrates an empty file, verifies checksums, and remains current", async () => {
    await migrateDatabase(testDatabase.database);
    const migrations = await pool.query<{ count: number }>(
      "SELECT count(*) count FROM schema_migrations",
    );
    expect(migrations.rows[0]!.count).toBe(EXPECTED_MIGRATION_COUNT);
    await expect(
      pool.query("SELECT 1 FROM workspaces LIMIT 1"),
    ).resolves.toBeDefined();
  });

  it("rejects an edited migration after it has been applied", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "vitae-migration-checksum-"),
    );
    const migration = path.join(directory, "0001_initial.sql");
    const databasePath = path.join(directory, "vitae.sqlite");
    await copyFile(path.resolve("db/migrations/0001_initial.sql"), migration);
    const connection = createDatabaseConnection(databasePath);
    try {
      await migrateDatabase(connection.database, directory);
      await writeFile(
        migration,
        `${await readFile(migration, "utf8")}\n-- forbidden history rewrite\n`,
      );
      await expect(
        migrateDatabase(connection.database, directory),
      ).rejects.toThrow("checksum changed");
    } finally {
      await connection.pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rolls back a failed transaction", async () => {
    const client = await pool.connect();
    const email = "rollback@example.test";
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO users (email,name) VALUES ($1,'Rollback')",
        [email],
      );
      throw new Error("synthetic transaction failure");
    } catch {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect(
      (await pool.query("SELECT id FROM users WHERE email=$1", [email]))
        .rowCount,
    ).toBe(0);
  });

  it("rejects cross-workspace references at the database boundary", async () => {
    const first = await createWorkspace("first-owner");
    const second = await createWorkspace("second-owner");
    const operation = await pool.query<{ id: string }>(
      "INSERT INTO job_operations (workspace_id,operation_type,idempotency_key,input_hash) VALUES ($1,'synthetic','second-job','sha256:synthetic') RETURNING id",
      [second.workspaceId],
    );
    await expect(
      pool.query(
        "INSERT INTO audit_events (workspace_id,actor_user_id,job_operation_id,action,target_type,target_id,outcome,correlation_id) VALUES ($1,$2,$3,'job.view','job_operation',$3,'denied','synthetic-correlation')",
        [first.workspaceId, first.userId, operation.rows[0]!.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("cascades workspace-owned rows on permanent deletion", async () => {
    const owner = await createWorkspace("delete-owner");
    await pool.query(
      "INSERT INTO job_operations (workspace_id,operation_type,idempotency_key,input_hash) VALUES ($1,'synthetic','delete-job','sha256:delete')",
      [owner.workspaceId],
    );
    await pool.query("DELETE FROM workspaces WHERE id=$1", [owner.workspaceId]);
    expect(
      (
        await pool.query(
          "SELECT id FROM career_profiles WHERE workspace_id=$1",
          [owner.workspaceId],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT id FROM job_operations WHERE workspace_id=$1",
          [owner.workspaceId],
        )
      ).rowCount,
    ).toBe(0);
  });
});

describe("job leasing", () => {
  it("leases a pending operation to only one concurrent worker", async () => {
    await pool.query("DELETE FROM job_operations");
    const owner = await createWorkspace("lease-owner");
    await pool.query(
      "INSERT INTO job_operations (workspace_id,operation_type,idempotency_key,input_hash) VALUES ($1,'synthetic','one-job','sha256:lease')",
      [owner.workspaceId],
    );
    const repository = new JobOperationRepository(pool);
    const leases = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        repository.leaseNext(`worker-${index}`, 30_000),
      ),
    );
    const acquired = leases.filter((lease) => lease !== undefined);
    expect(acquired).toHaveLength(1);
    expect(acquired[0]!.workspaceId).toBe(owner.workspaceId);
    await expect(
      repository.markSucceeded({
        id: acquired[0]!.id,
        workspaceId: owner.workspaceId,
        workerId: acquired[0]!.leaseOwner,
      }),
    ).resolves.toBe(true);
  });
});
