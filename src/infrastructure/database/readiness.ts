import type { Pool } from "./sqlite-pool";

export const EXPECTED_MIGRATIONS = [
  {
    version: "0001_initial.sql",
    checksum:
      "1c3935491bc5106ff06e11503d6d1d44728270c70ecd42ffcc275087773ea29e",
  },
  {
    version: "0002_integrity_guards.sql",
    checksum:
      "469aa407456042af8d435c093535212c6be33587e1256fd774eea0a3b6329991",
  },
] as const;

export const EXPECTED_MIGRATION_COUNT = EXPECTED_MIGRATIONS.length;

const requiredSchemaObjects = new Set([
  "table:workspaces",
  "trigger:career_profiles_frozen_delete",
  "trigger:document_versions_immutable_delete",
  "trigger:source_documents_storage_key_insert",
]);

function notCurrent(): never {
  throw new Error("Database migrations are not current.");
}

export async function checkDatabaseReadiness(pool: Pool): Promise<{
  migrationCount: number;
}> {
  const migrations = await pool.query<{ version: string; checksum: string }>(
    "SELECT version,checksum FROM schema_migrations ORDER BY version",
  );
  if (
    migrations.rows.length !== EXPECTED_MIGRATIONS.length ||
    EXPECTED_MIGRATIONS.some(
      (expected, index) =>
        migrations.rows[index]?.version !== expected.version ||
        migrations.rows[index]?.checksum !== expected.checksum,
    )
  )
    notCurrent();

  const objects = await pool.query<{ type: string; name: string }>(
    `SELECT type,name FROM sqlite_master
     WHERE (type='table' AND name='workspaces')
        OR (type='trigger' AND name IN
          ('career_profiles_frozen_delete','document_versions_immutable_delete',
           'source_documents_storage_key_insert'))`,
  );
  const present = new Set(objects.rows.map((row) => `${row.type}:${row.name}`));
  if ([...requiredSchemaObjects].some((name) => !present.has(name)))
    notCurrent();

  const foreignKeys = await pool.query<{ foreign_keys: number }>(
    "PRAGMA foreign_keys",
  );
  if (Number(foreignKeys.rows[0]?.foreign_keys ?? 0) !== 1) notCurrent();

  const integrity = await pool.query<{ quick_check: string }>(
    "PRAGMA quick_check(1)",
  );
  if (integrity.rows.length !== 1 || integrity.rows[0]?.quick_check !== "ok")
    notCurrent();

  const violations = await pool.query<Record<string, unknown>>(
    "PRAGMA foreign_key_check",
  );
  if (violations.rows.length > 0) notCurrent();

  return { migrationCount: migrations.rows.length };
}
