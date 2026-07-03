import path from "node:path";

import { createDatabaseConnection } from "../src/infrastructure/database/connection";
import { migrateDatabase } from "../src/infrastructure/database/migration";

const databasePath = process.env.DATABASE_PATH;
if (!databasePath) throw new Error("DATABASE_PATH is required.");
const migrationsFolder = path.resolve(
  process.env.MIGRATIONS_PATH ?? "db/migrations",
);
const connection = createDatabaseConnection(databasePath);
try {
  await migrateDatabase(connection.database, migrationsFolder);
  process.stdout.write("Local SQLite migrations applied.\n");
} finally {
  await connection.pool.end();
}
