// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  countForbiddenFields,
  PORTABLE_TABLES,
  portabilityArchiveSchema,
  sha256,
} from "@/modules/portability/domain";

function emptyArchive() {
  return {
    schemaVersion: 1 as const,
    product: "vitae-stack" as const,
    exportedAt: "2026-06-30T12:00:00.000Z",
    sourceWorkspaceId: "00000000-0000-4000-8000-000000000001",
    options: { sources: false, artifacts: false },
    tables: Object.fromEntries(PORTABLE_TABLES.map((table) => [table, []])),
    blobs: [],
    warnings: [],
  };
}

describe("portability archive contract", () => {
  it("requires every allowlisted collection and rejects unknown tables", () => {
    expect(portabilityArchiveSchema.parse(emptyArchive()).schemaVersion).toBe(
      1,
    );
    const unknown = emptyArchive();
    unknown.tables.unknown_table = [];
    expect(() => portabilityArchiveSchema.parse(unknown)).toThrow();
    const missing = emptyArchive();
    delete missing.tables.documents;
    expect(() => portabilityArchiveSchema.parse(missing)).toThrow();
  });

  it("detects secret-bearing fields recursively and hashes blobs", () => {
    expect(
      countForbiddenFields({
        provider: { credential_ciphertext: "private", label: "Local" },
      }),
    ).toBe(1);
    expect(sha256(Buffer.from("synthetic"))).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });
});
