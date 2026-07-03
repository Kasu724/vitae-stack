// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EXPECTED_MIGRATION_COUNT } from "@/infrastructure/database/readiness";

describe("SQLite migration artifacts", () => {
  it("contains the reviewed initial migration", async () => {
    const migrationDirectory = path.resolve("db/migrations");
    const migrationFiles = (await readdir(migrationDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    expect(migrationFiles).toEqual(["0001_initial.sql"]);
    expect(migrationFiles).toHaveLength(EXPECTED_MIGRATION_COUNT);
  });

  it("defines foreign keys, immutable-history guards, and no PostgreSQL roles", async () => {
    const sql = await readFile(
      path.resolve("db/migrations/0001_initial.sql"),
      "utf8",
    );

    expect(sql).toContain("PRAGMA foreign_keys = ON");
    expect(sql).toContain('CREATE TABLE "users"');
    expect(sql).toContain("CREATE TRIGGER");
    expect(sql).toContain("immutable");
    expect(sql).not.toMatch(/GRANT|CREATE ROLE|JSONB|UUID_GENERATE/iu);
  });
});
