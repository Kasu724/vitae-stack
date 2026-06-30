import type { Pool } from "pg";

export const EXPECTED_MIGRATION_COUNT = 13;

interface ReadinessRow {
  migration_count: string;
  workspace_table: string | null;
}

export async function checkDatabaseReadiness(pool: Pool): Promise<{
  migrationCount: number;
}> {
  const result = await pool.query<ReadinessRow>(
    `SELECT
       (SELECT count(*)::text FROM drizzle.__drizzle_migrations) AS migration_count,
       to_regclass('public.workspaces')::text AS workspace_table`,
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
