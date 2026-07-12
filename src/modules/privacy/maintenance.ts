import type {
  WorkspaceDeletionReceipt,
  WorkspaceDeletionService,
} from "./workspace-deletion-service";

export interface DeletionMaintenanceCycleResult {
  processed: number;
  failed: number;
  expiredArtifacts: number;
  orphanedArtifacts: number;
}

type MaintenanceService = Pick<
  WorkspaceDeletionService,
  "processNext" | "cleanupExpiredAndOrphanedArtifacts"
>;

export async function runDeletionMaintenanceCycle(
  service: MaintenanceService,
  maximumOperations = 25,
): Promise<DeletionMaintenanceCycleResult> {
  let processed = 0;
  let failed = 0;
  while (processed < maximumOperations) {
    const operation: WorkspaceDeletionReceipt | null =
      await service.processNext();
    if (!operation) break;
    processed += 1;
    if (operation.state === "failed") failed += 1;
  }
  const cleanup = await service.cleanupExpiredAndOrphanedArtifacts();
  return {
    processed,
    failed,
    expiredArtifacts: cleanup.expired,
    orphanedArtifacts: cleanup.orphaned,
  };
}
