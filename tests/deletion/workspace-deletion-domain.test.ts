// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { requireRecentAuthentication } from "@/modules/auth/workspace-access";
import { DeletionTombstoneStore } from "@/modules/privacy/tombstone-store";

describe("destructive operation confirmation", () => {
  it("allows the sole loopback-local principal without an account session", () => {
    expect(() =>
      requireRecentAuthentication(
        {
          authenticatedAt: new Date("2026-06-30T10:00:00Z"),
          mode: "trusted-local",
          userId: crypto.randomUUID(),
          workspaceId: crypto.randomUUID(),
        },
        15 * 60 * 1000,
        new Date("2026-06-30T11:00:00Z"),
      ),
    ).not.toThrow();
    expect(() =>
      requireRecentAuthentication({
        authenticatedAt: new Date(0),
        mode: "trusted-local",
        userId: crypto.randomUUID(),
        workspaceId: crypto.randomUUID(),
      }),
    ).not.toThrow();
  });

  it("persists an idempotent content-free replay tombstone", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "vitae-tombstone-"));
    try {
      const store = new DeletionTombstoneStore(root);
      const value = {
        schemaVersion: 1 as const,
        operationId: crypto.randomUUID(),
        workspaceId: crypto.randomUUID(),
        requesterUserHash: "a".repeat(64),
        requestedAt: "2026-06-30T12:00:00.000Z",
        backupExpiresAt: "2026-07-30T12:00:00.000Z",
      };
      await store.put(value);
      await store.put(value);
      expect(await store.has(value.workspaceId)).toBe(true);
      expect(await store.list()).toEqual([value]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
