import { createDatabaseConnection } from "../src/infrastructure/database/connection";
import { migrateDatabase } from "../src/infrastructure/database/migration";

const migrationUrl =
  process.env.DATABASE_MIGRATION_URL ??
  "postgresql://vitae_owner:vitae-owner-dev-only@127.0.0.1:5432/vitae";

const { database, pool } = createDatabaseConnection(migrationUrl, {
  maxConnections: 1,
});

try {
  await migrateDatabase(database);
  console.log("Database migrations applied.");
} finally {
  await pool.end();
}
