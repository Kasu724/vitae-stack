import { describe, expect, it, vi } from "vitest";

import {
  checkDatabaseReadiness,
  EXPECTED_MIGRATION_COUNT,
  EXPECTED_MIGRATIONS,
} from "@/infrastructure/database/readiness";

const requiredObjects = [
  { type: "table", name: "workspaces" },
  { type: "trigger", name: "career_profiles_frozen_delete" },
  { type: "trigger", name: "document_versions_immutable_delete" },
  { type: "trigger", name: "source_documents_storage_key_insert" },
];

function readinessPool(
  migrations: Array<{ version: string; checksum: string }> = [
    ...EXPECTED_MIGRATIONS,
  ],
  objects = requiredObjects,
) {
  return {
    query: vi
      .fn()
      .mockResolvedValueOnce({ rows: migrations })
      .mockResolvedValueOnce({ rows: objects })
      .mockResolvedValueOnce({ rows: [{ foreign_keys: 1 }] })
      .mockResolvedValueOnce({ rows: [{ quick_check: "ok" }] })
      .mockResolvedValueOnce({ rows: [] }),
  };
}

describe("database readiness", () => {
  it("accepts the exact reviewed migration set and critical schema", async () => {
    await expect(
      checkDatabaseReadiness(readinessPool() as never),
    ).resolves.toEqual({ migrationCount: EXPECTED_MIGRATION_COUNT });
  });

  it("rejects missing, unknown, and checksum-mismatched migrations", async () => {
    await expect(
      checkDatabaseReadiness(
        readinessPool([...EXPECTED_MIGRATIONS].slice(0, -1)) as never,
      ),
    ).rejects.toThrow("Database migrations are not current.");

    const unknown: Array<{ version: string; checksum: string }> = [
      ...EXPECTED_MIGRATIONS,
    ].map((row) => ({ ...row }));
    unknown[1] = { version: "9999_fake.sql", checksum: unknown[1]!.checksum };
    await expect(
      checkDatabaseReadiness(readinessPool(unknown) as never),
    ).rejects.toThrow("Database migrations are not current.");

    const changed: Array<{ version: string; checksum: string }> = [
      ...EXPECTED_MIGRATIONS,
    ].map((row) => ({ ...row }));
    changed[0]!.checksum = "0".repeat(64);
    await expect(
      checkDatabaseReadiness(readinessPool(changed) as never),
    ).rejects.toThrow("Database migrations are not current.");
  });

  it("rejects a missing critical guard or failed integrity check", async () => {
    await expect(
      checkDatabaseReadiness(
        readinessPool(
          [...EXPECTED_MIGRATIONS],
          requiredObjects.slice(0, -1),
        ) as never,
      ),
    ).rejects.toThrow("Database migrations are not current.");

    const corrupt = readinessPool();
    corrupt.query
      .mockReset()
      .mockResolvedValueOnce({ rows: [...EXPECTED_MIGRATIONS] })
      .mockResolvedValueOnce({ rows: requiredObjects })
      .mockResolvedValueOnce({ rows: [{ foreign_keys: 1 }] })
      .mockResolvedValueOnce({ rows: [{ quick_check: "corrupt" }] });
    await expect(checkDatabaseReadiness(corrupt as never)).rejects.toThrow(
      "Database migrations are not current.",
    );
  });
});
