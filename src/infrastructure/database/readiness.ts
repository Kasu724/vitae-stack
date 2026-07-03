import type { Pool } from "./sqlite-pool";

export const EXPECTED_MIGRATION_COUNT = 1;

interface ReadinessRow {
  migration_count: number;
  workspace_table: string | null;
}

export async function checkDatabaseReadiness(pool: Pool): Promise<{
  migrationCount: number;
}> {
  const result = await pool.query<ReadinessRow>(
    `SELECT
       (SELECT count(*) FROM schema_migrations) AS migration_count,
       (SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces') AS workspace_table`,
  );
  const row = result.rows[0];
  const migrationCount = Number(row?.migration_count ?? 0);

  if (
    row?.workspace_table !== "workspaces" ||
    migrationCount < EXPECTED_MIGRATION_COUNT
  ) {
    throw new Error("Database migrations are not current.");
  }

  return { migrationCount };
}
