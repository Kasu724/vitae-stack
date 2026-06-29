import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../../db/schema";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  database: Database;
  pool: Pool;
}

export function createDatabaseConnection(
  connectionString: string,
  options: { maxConnections?: number } = {},
): DatabaseConnection {
  const pool = new Pool({
    connectionString,
    max: options.maxConnections ?? 10,
    allowExitOnIdle: true,
  });

  return {
    database: drizzle(pool, { schema }),
    pool,
  };
}
