import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Database } from "./connection";

function migrationChecksums(sql: string): {
  accepted: Set<string>;
  canonical: string;
  canonicalSql: string;
} {
  const canonicalSql = sql.replace(/\r\n?/gu, "\n");
  const checksum = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const canonical = checksum(canonicalSql);
  return {
    accepted: new Set([
      canonical,
      checksum(canonicalSql.replace(/\n/gu, "\r\n")),
    ]),
    canonical,
    canonicalSql,
  };
}

export async function migrateDatabase(
  database: Database,
  migrationsFolder = "db/migrations",
): Promise<void> {
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  const files = (await readdir(migrationsFolder))
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/iu.test(file))
    .sort();
  const applied = await database.query<{ version: string }>(
    "SELECT version FROM schema_migrations ORDER BY version",
  );
  const bundled = new Set(files);
  const unknown = applied.rows.find((row) => !bundled.has(row.version));
  if (unknown)
    throw new Error(
      `Database contains an unknown migration: ${unknown.version}`,
    );
  for (const file of files) {
    const sql = await readFile(path.join(migrationsFolder, file), "utf8");
    const checksums = migrationChecksums(sql);
    const current = await database.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE version=$1",
      [file],
    );
    if (current.rows[0]) {
      if (!checksums.accepted.has(current.rows[0].checksum))
        throw new Error(`Applied migration checksum changed: ${file}`);
      if (current.rows[0].checksum !== checksums.canonical) {
        await database.query(
          "UPDATE schema_migrations SET checksum=$2 WHERE version=$1",
          [file, checksums.canonical],
        );
      }
      continue;
    }
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(checksums.canonicalSql);
      await database.query(
        "INSERT INTO schema_migrations (version,checksum) VALUES ($1,$2)",
        [file, checksums.canonical],
      );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  database.enableDefensiveMode();
}
