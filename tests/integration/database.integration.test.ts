// @vitest-environment node

import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseConnection } from "@/infrastructure/database/connection";
import { JobOperationRepository } from "@/infrastructure/database/job-operation-repository";
import { migrateDatabase } from "@/infrastructure/database/migration";
import { EXPECTED_MIGRATION_COUNT } from "@/infrastructure/database/readiness";

const image = "postgres:18.4-bookworm";
const adminPassword = "synthetic-admin-password";
const runtimePassword = "synthetic-runtime-password";

let container: StartedPostgreSqlContainer;
let ownerPool: Pool;
let runtimePool: Pool;

async function migrateUrl(
  connectionString: string,
  migrationsFolder = path.resolve("db/migrations"),
) {
  const connection = createDatabaseConnection(connectionString, {
    maxConnections: 2,
  });
  try {
    await migrateDatabase(connection.database, migrationsFolder);
  } finally {
    await connection.pool.end();
  }
}

function databaseUrl(username: string, password: string, database: string) {
  return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${container.getHost()}:${container.getPort()}/${database}`;
}

async function createWorkspace(label: string) {
  const user = await ownerPool.query<{ id: string }>(
    `INSERT INTO users (email, name)
     VALUES ($1, $2)
     RETURNING id`,
    [`${label}@example.test`, label],
  );
  const userId = user.rows[0]!.id;
  const workspace = await ownerPool.query<{ id: string }>(
    `INSERT INTO workspaces (owner_user_id, name)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, `${label} workspace`],
  );
  const workspaceId = workspace.rows[0]!.id;
  await ownerPool.query(
    `INSERT INTO workspace_memberships (workspace_id, user_id)
     VALUES ($1, $2)`,
    [workspaceId, userId],
  );
  await ownerPool.query(
    `INSERT INTO career_profiles (workspace_id, display_name)
     VALUES ($1, $2)`,
    [workspaceId, label],
  );
  return { userId, workspaceId };
}

beforeAll(async () => {
  container = await new PostgreSqlContainer(image)
    .withDatabase("vitae_test")
    .withUsername("postgres")
    .withPassword(adminPassword)
    .start();

  ownerPool = new Pool({ connectionString: container.getConnectionUri() });
  await ownerPool.query(
    `CREATE ROLE vitae_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${runtimePassword}'`,
  );
  await ownerPool.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  await migrateUrl(container.getConnectionUri());
  runtimePool = new Pool({
    connectionString: databaseUrl(
      "vitae_app",
      runtimePassword,
      container.getDatabase(),
    ),
  });
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await ownerPool?.end();
  await container?.stop();
});

describe("migrations and database ownership", () => {
  it("migrates an empty database and remains current when rerun", async () => {
    await migrateUrl(container.getConnectionUri());
    const migrations = await ownerPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
    );
    expect(Number(migrations.rows[0]!.count)).toBe(EXPECTED_MIGRATION_COUNT);
    await expect(
      ownerPool.query("SELECT 1 FROM workspaces LIMIT 1"),
    ).resolves.toBeDefined();
  });

  it("upgrades a database from the first committed migration", async () => {
    const database = "previous_version_test";
    await ownerPool.query(`CREATE DATABASE ${database}`);
    const previousDirectory = await mkdtemp(
      path.join(tmpdir(), "vitae-previous-migrations-"),
    );
    await mkdir(path.join(previousDirectory, "meta"));
    await copyFile(
      path.resolve("db/migrations/0000_identity-foundation.sql"),
      path.join(previousDirectory, "0000_identity-foundation.sql"),
    );
    const journal = JSON.parse(
      await readFile(path.resolve("db/migrations/meta/_journal.json"), "utf8"),
    ) as { entries: unknown[] };
    journal.entries = journal.entries.slice(0, 1);
    await writeFile(
      path.join(previousDirectory, "meta/_journal.json"),
      `${JSON.stringify(journal, null, 2)}\n`,
    );

    const upgradeUrl = databaseUrl("postgres", adminPassword, database);
    try {
      await migrateUrl(upgradeUrl, previousDirectory);
      const beforeUpgrade = new Pool({ connectionString: upgradeUrl });
      const absent = await beforeUpgrade.query<{ table_name: string | null }>(
        "SELECT to_regclass('public.job_operations')::text AS table_name",
      );
      await beforeUpgrade.end();
      expect(absent.rows[0]!.table_name).toBeNull();

      await migrateUrl(upgradeUrl);
      const afterUpgrade = new Pool({ connectionString: upgradeUrl });
      const present = await afterUpgrade.query<{ table_name: string | null }>(
        "SELECT to_regclass('public.job_operations')::text AS table_name",
      );
      await afterUpgrade.end();
      expect(present.rows[0]!.table_name).toBe("job_operations");
    } finally {
      await rm(previousDirectory, { recursive: true, force: true });
    }
  });

  it("rolls back a failed ownership transaction", async () => {
    const client = await ownerPool.connect();
    const email = "rollback@example.test";
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO users (email, name) VALUES ($1, 'Rollback')",
        [email],
      );
      throw new Error("synthetic transaction failure");
    } catch {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const result = await ownerPool.query(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );
    expect(result.rowCount).toBe(0);
  });

  it("rejects cross-workspace job references at the database boundary", async () => {
    const first = await createWorkspace("first-owner");
    const second = await createWorkspace("second-owner");
    const operation = await ownerPool.query<{ id: string }>(
      `INSERT INTO job_operations
         (workspace_id, operation_type, idempotency_key, input_hash)
       VALUES ($1, 'synthetic', 'second-job', 'sha256:synthetic')
       RETURNING id`,
      [second.workspaceId],
    );

    await expect(
      ownerPool.query(
        `INSERT INTO audit_events
           (workspace_id, actor_user_id, job_operation_id, action, target_type, target_id, outcome, correlation_id)
         VALUES ($1, $2, $3, 'job.view', 'job_operation', $3, 'denied', 'synthetic-correlation')`,
        [first.workspaceId, first.userId, operation.rows[0]!.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("cascades workspace-owned rows on permanent workspace deletion", async () => {
    const owner = await createWorkspace("delete-owner");
    await ownerPool.query(
      `INSERT INTO job_operations
         (workspace_id, operation_type, idempotency_key, input_hash)
       VALUES ($1, 'synthetic', 'delete-job', 'sha256:delete')`,
      [owner.workspaceId],
    );

    await ownerPool.query("DELETE FROM workspaces WHERE id = $1", [
      owner.workspaceId,
    ]);
    const profile = await ownerPool.query(
      "SELECT id FROM career_profiles WHERE workspace_id = $1",
      [owner.workspaceId],
    );
    const operation = await ownerPool.query(
      "SELECT id FROM job_operations WHERE workspace_id = $1",
      [owner.workspaceId],
    );
    expect(profile.rowCount).toBe(0);
    expect(operation.rowCount).toBe(0);
  });

  it("allows runtime DML but rejects runtime DDL", async () => {
    await expect(
      runtimePool.query("SELECT count(*) FROM workspaces"),
    ).resolves.toBeDefined();
    await expect(
      runtimePool.query("CREATE TABLE runtime_must_not_create (id integer)"),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("job leasing", () => {
  it("leases a pending operation to only one concurrent worker", async () => {
    await ownerPool.query("DELETE FROM job_operations");
    const owner = await createWorkspace("lease-owner");
    await ownerPool.query(
      `INSERT INTO job_operations
         (workspace_id, operation_type, idempotency_key, input_hash)
       VALUES ($1, 'synthetic', 'one-job', 'sha256:lease')`,
      [owner.workspaceId],
    );

    const repository = new JobOperationRepository(ownerPool);
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
