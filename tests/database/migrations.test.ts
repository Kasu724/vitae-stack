// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EXPECTED_MIGRATION_COUNT } from "@/infrastructure/database/readiness";

describe("database migration artifacts", () => {
  it("contains ordered forward-only migrations without destructive statements", async () => {
    const migrationDirectory = path.resolve("db/migrations");
    const migrationFiles = (await readdir(migrationDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    expect(migrationFiles).toEqual([
      "0000_identity-foundation.sql",
      "0001_operations-audit.sql",
      "0002_audit-workspace-ownership.sql",
      "0003_authentication.sql",
      "0004_career-information-bank.sql",
      "0005_document-library-versioning.sql",
      "0006_private-source-document-storage.sql",
      "0007_extraction-review.sql",
      "0008_job-description-snapshots.sql",
      "0009_secure-job-url-import.sql",
      "0010_model-provider-configuration.sql",
      "0011_job-requirement-analysis.sql",
      "0012_requirement-evidence-matching.sql",
    ]);

    for (const migrationFile of migrationFiles) {
      const sql = await readFile(
        path.join(migrationDirectory, migrationFile),
        "utf8",
      );
      expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE)\b/iu);
    }
  });

  it("grants runtime DML without granting schema mutation", async () => {
    const sql = await readFile(
      path.resolve("db/migrations/0001_operations-audit.sql"),
      "utf8",
    );

    expect(sql).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vitae_app",
    );
    expect(sql).not.toMatch(/GRANT\s+(?:ALL|CREATE).*TO vitae_app/iu);
  });

  it("keeps the readiness expectation synchronized with the journal", async () => {
    const journal = JSON.parse(
      await readFile(path.resolve("db/migrations/meta/_journal.json"), "utf8"),
    ) as { entries: unknown[] };

    expect(journal.entries).toHaveLength(EXPECTED_MIGRATION_COUNT);
  });
});
