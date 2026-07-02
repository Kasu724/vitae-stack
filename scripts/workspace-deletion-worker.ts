import { createDatabaseConnection } from "../src/infrastructure/database/connection";
import { WorkspaceDeletionService } from "../src/modules/privacy/workspace-deletion-service";

const connection = createDatabaseConnection(
  process.env.DATABASE_URL ??
    "postgresql://vitae_app:vitae-app-dev-only@127.0.0.1:5432/vitae",
  { maxConnections: 2 },
);
const service = new WorkspaceDeletionService(connection.pool, {
  ARTIFACT_STORAGE_ROOT:
    process.env.ARTIFACT_STORAGE_ROOT ?? "/var/lib/vitae/artifacts",
  PARSER_QUEUE_ROOT:
    process.env.PARSER_QUEUE_ROOT ?? "/var/lib/vitae/parser-queue",
  JOB_FETCH_QUEUE_ROOT:
    process.env.JOB_FETCH_QUEUE_ROOT ?? "/var/lib/vitae/job-fetch-queue",
});

process.stdout.write("Workspace deletion worker ready.\n");
let nextCleanupAt = 0;
for (;;) {
  await service.reconcileTombstones();
  if (Date.now() >= nextCleanupAt) {
    await service.cleanupExpiredAndOrphanedArtifacts();
    nextCleanupAt = Date.now() + 60_000;
  }
  await service.processNext();
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
