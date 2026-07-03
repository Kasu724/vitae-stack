import { createDatabaseConnection } from "../src/infrastructure/database/connection";
import { migrateDatabase } from "../src/infrastructure/database/migration";

const databasePath = process.env.DATABASE_PATH ?? "./var/vitae.sqlite";

const { database, pool } = createDatabaseConnection(databasePath, {
  maxConnections: 1,
});

try {
  await migrateDatabase(database);
  console.log("Database migrations applied.");
} finally {
  await pool.end();
}
