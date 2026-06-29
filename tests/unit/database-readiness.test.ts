import { describe, expect, it, vi } from "vitest";

import {
  checkDatabaseReadiness,
  EXPECTED_MIGRATION_COUNT,
} from "@/infrastructure/database/readiness";

describe("database readiness", () => {
  it("accepts the required schema and migration count", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            migration_count: String(EXPECTED_MIGRATION_COUNT),
            workspace_table: "workspaces",
          },
        ],
      }),
    };

    await expect(checkDatabaseReadiness(pool as never)).resolves.toEqual({
      migrationCount: EXPECTED_MIGRATION_COUNT,
    });
  });

  it("rejects a database behind the expected migration count", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            migration_count: String(EXPECTED_MIGRATION_COUNT - 1),
            workspace_table: "workspaces",
          },
        ],
      }),
    };

    await expect(checkDatabaseReadiness(pool as never)).rejects.toThrow(
      "Database migrations are not current.",
    );
  });
});
