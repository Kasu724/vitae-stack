import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createDatabaseConnection,
  type DatabaseConnection,
} from "@/infrastructure/database/connection";
import { migrateDatabase } from "@/infrastructure/database/migration";

export interface SqliteTestDatabase extends DatabaseConnection {
  directory: string;
  path: string;
  cleanup(): Promise<void>;
}

export async function createSqliteTestDatabase(
  label: string,
): Promise<SqliteTestDatabase> {
  const directory = await mkdtemp(path.join(tmpdir(), `vitae-${label}-`));
  const databasePath = path.join(directory, "vitae.sqlite");
  const connection = createDatabaseConnection(databasePath);
  await migrateDatabase(connection.database);
  return {
    ...connection,
    directory,
    path: databasePath,
    async cleanup() {
      await connection.pool.end();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
