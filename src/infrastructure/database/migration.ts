import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Database } from "./connection";

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
  for (const file of files) {
    const sql = await readFile(path.join(migrationsFolder, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const current = await database.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE version=$1",
      [file],
    );
    if (current.rows[0]) {
      if (current.rows[0].checksum !== checksum)
        throw new Error(`Applied migration checksum changed: ${file}`);
      continue;
    }
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(sql);
      await database.query(
        "INSERT INTO schema_migrations (version,checksum) VALUES ($1,$2)",
        [file, checksum],
      );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  database.enableDefensiveMode();
}
