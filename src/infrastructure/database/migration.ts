import { migrate } from "drizzle-orm/node-postgres/migrator";

import type { Database } from "./connection";

export async function migrateDatabase(
  database: Database,
  migrationsFolder = "db/migrations",
): Promise<void> {
  await migrate(database, { migrationsFolder });
}
