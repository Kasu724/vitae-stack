import path from "node:path";

import { SqlitePool } from "./sqlite-pool";

export type Database = SqlitePool;

export interface DatabaseConnection {
  database: Database;
  pool: SqlitePool;
}

export function createDatabaseConnection(
  databasePath: string,
  _options: { maxConnections?: number } = {},
): DatabaseConnection {
  void _options;
  const resolvedPath =
    databasePath === ":memory:" ? databasePath : path.resolve(databasePath);
  const pool = new SqlitePool(resolvedPath);

  return {
    database: pool,
    pool,
  };
}
