// @vitest-environment node

import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseConnection } from "@/infrastructure/database/connection";
import { JobOperationRepository } from "@/infrastructure/database/job-operation-repository";
import { migrateDatabase } from "@/infrastructure/database/migration";
import { EXPECTED_MIGRATION_COUNT } from "@/infrastructure/database/readiness";
import { createInitialDocument } from "@/modules/documents/document-schema";
import { contentHash } from "@/modules/documents/hash";
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

  it("canonicalizes Windows migration line endings and repairs legacy checksums", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "vitae-migration-line-endings-"),
    );
    const migration = path.join(directory, "0001_line_endings.sql");
    const databasePath = path.join(directory, "vitae.sqlite");
    const canonicalSql =
      "CREATE TABLE line_ending_check (id TEXT PRIMARY KEY);\n";
    const windowsSql = canonicalSql.replace(/\n/gu, "\r\n");
    const hash = (value: string) =>
      createHash("sha256").update(value).digest("hex");
    await writeFile(migration, windowsSql);
    const connection = createDatabaseConnection(databasePath);
    try {
      await migrateDatabase(connection.database, directory);
      const applied = await connection.pool.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE version=$1",
        ["0001_line_endings.sql"],
      );
      expect(applied.rows[0]?.checksum).toBe(hash(canonicalSql));

      await connection.pool.query(
        "UPDATE schema_migrations SET checksum=$2 WHERE version=$1",
        ["0001_line_endings.sql", hash(windowsSql)],
      );
      await writeFile(migration, canonicalSql);
      await migrateDatabase(connection.database, directory);
      const repaired = await connection.pool.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE version=$1",
        ["0001_line_endings.sql"],
      );
      expect(repaired.rows[0]?.checksum).toBe(hash(canonicalSql));
    } finally {
      await connection.pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects applied migrations that are absent from the running bundle", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "vitae-migration-unknown-"),
    );
    const databasePath = path.join(directory, "vitae.sqlite");
    await copyFile(
      path.resolve("db/migrations/0001_initial.sql"),
      path.join(directory, "0001_initial.sql"),
    );
    const connection = createDatabaseConnection(databasePath);
    try {
      await migrateDatabase(connection.database, directory);
      await connection.pool.query(
        "INSERT INTO schema_migrations (version,checksum) VALUES ('9999_future.sql',$1)",
        ["0".repeat(64)],
      );
      await expect(
        migrateDatabase(connection.database, directory),
      ).rejects.toThrow("unknown migration: 9999_future.sql");
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

  it("protects current immutable document history and its context", async () => {
    const owner = await createWorkspace("immutable-owner");
    const profile = await pool.query<{ id: string }>(
      "SELECT id FROM career_profiles WHERE workspace_id=$1",
      [owner.workspaceId],
    );
    const document = await pool.query<{ id: string }>(
      `INSERT INTO documents (workspace_id,career_profile_id,kind,title)
       VALUES ($1,$2,'resume','Immutable fixture') RETURNING id`,
      [owner.workspaceId, profile.rows[0]!.id],
    );
    const otherDocument = await pool.query<{ id: string }>(
      `INSERT INTO documents (workspace_id,career_profile_id,kind,title)
       VALUES ($1,$2,'resume','Other fixture') RETURNING id`,
      [owner.workspaceId, profile.rows[0]!.id],
    );
    const content = createInitialDocument("resume");
    const version = await pool.query<{ id: string }>(
      `INSERT INTO document_versions
         (workspace_id,document_id,author_user_id,reason,content,content_hash)
       VALUES ($1,$2,$3,'initial',$4::jsonb,$5) RETURNING id`,
      [
        owner.workspaceId,
        document.rows[0]!.id,
        owner.userId,
        JSON.stringify(content),
        contentHash(content),
      ],
    );
    await pool.query(
      "UPDATE documents SET current_version_id=$1 WHERE id=$2 AND workspace_id=$3",
      [version.rows[0]!.id, document.rows[0]!.id, owner.workspaceId],
    );

    await expect(
      pool.query("DELETE FROM document_versions WHERE id=$1", [
        version.rows[0]!.id,
      ]),
    ).rejects.toThrow("immutable history cannot be deleted");
    await expect(
      pool.query(
        "UPDATE documents SET current_version_id=$1 WHERE id=$2 AND workspace_id=$3",
        [version.rows[0]!.id, otherDocument.rows[0]!.id, owner.workspaceId],
      ),
    ).rejects.toThrow("document current version context mismatch");
  });

  it("blocks ordinary deletes after a workspace is frozen", async () => {
    const owner = await createWorkspace("frozen-delete-owner");
    const skill = await pool.query<{ id: string }>(
      `INSERT INTO skills (workspace_id,canonical_name,display_name)
       VALUES ($1,'frozen-delete','Frozen delete') RETURNING id`,
      [owner.workspaceId],
    );
    await pool.query(
      "UPDATE workspaces SET deletion_requested_at=now() WHERE id=$1",
      [owner.workspaceId],
    );
    await expect(
      pool.query("DELETE FROM skills WHERE id=$1", [skill.rows[0]!.id]),
    ).rejects.toThrow("workspace pending deletion");
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
