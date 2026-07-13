// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EXPECTED_MIGRATION_COUNT } from "@/infrastructure/database/readiness";

describe("SQLite migration artifacts", () => {
  it("contains the complete reviewed migration sequence", async () => {
    const migrationDirectory = path.resolve("db/migrations");
    const migrationFiles = (await readdir(migrationDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    expect(migrationFiles).toEqual([
      "0001_initial.sql",
      "0002_integrity_guards.sql",
      "0003_extraction_ai.sql",
    ]);
    expect(migrationFiles).toHaveLength(EXPECTED_MIGRATION_COUNT);
  });

  it("defines foreign keys, immutable-history guards, and no PostgreSQL roles", async () => {
    const sql = (
      await Promise.all([
        readFile(path.resolve("db/migrations/0001_initial.sql"), "utf8"),
        readFile(
          path.resolve("db/migrations/0002_integrity_guards.sql"),
          "utf8",
        ),
        readFile(path.resolve("db/migrations/0003_extraction_ai.sql"), "utf8"),
      ])
    ).join("\n");

    expect(sql).toContain("PRAGMA foreign_keys = ON");
    expect(sql).toContain('CREATE TABLE "users"');
    expect(sql).toContain("CREATE TRIGGER");
    expect(sql).toContain("immutable");
    expect(sql).toContain("_frozen_delete");
    expect(sql).toContain("proposed_entry_key");
    expect(sql).toContain("extraction_batches_metadata_insert");
    expect(sql).not.toMatch(/GRANT|CREATE ROLE|JSONB|UUID_GENERATE/iu);
  });
});
