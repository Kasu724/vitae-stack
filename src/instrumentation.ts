interface PrivacyMaintenanceState {
  started: boolean;
  running: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const runtime = globalThis as typeof globalThis & {
    vitaePrivacyMaintenance?: PrivacyMaintenanceState;
  };
  if (runtime.vitaePrivacyMaintenance?.started) return;
  const state: PrivacyMaintenanceState = (runtime.vitaePrivacyMaintenance = {
    started: true,
    running: false,
  });

  const [environmentModule, databaseModule, deletionModule, maintenanceModule] =
    await Promise.all([
      import("@/infrastructure/config/environment"),
      import("@/infrastructure/database/runtime"),
      import("@/modules/privacy/workspace-deletion-service"),
      import("@/modules/privacy/maintenance"),
    ]);
  const service = new deletionModule.WorkspaceDeletionService(
    databaseModule.getRuntimePool(),
    environmentModule.readServerEnvironment(),
  );
  try {
    // Startup is a safety barrier: restored tombstones must freeze their
    // workspaces before the server begins accepting application requests.
    await service.reconcileTombstones();
  } catch (error) {
    state.started = false;
    throw error;
  }

  const run = async () => {
    if (state.running) return;
    state.running = true;
    try {
      await maintenanceModule.runDeletionMaintenanceCycle(service);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "privacy.maintenance.failed",
          errorCode:
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof error.code === "string"
              ? error.code
              : "UNCLASSIFIED",
        }),
      );
    } finally {
      state.running = false;
      state.timer = setTimeout(run, 60_000);
      state.timer.unref?.();
    }
  };
  void run();
}
