import { describe, expect, it } from "vitest";

import {
  ProviderRequestGuard,
  ProviderRequestGuardError,
} from "../../src/modules/providers/request-guard";

describe("provider request guard", () => {
  it("rejects excess concurrent and per-minute starts", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const guard = new ProviderRequestGuard(() => 1_000, 1, 2);
    const first = guard.run("provider", () => pending);
    await expect(
      guard.run("provider", () => Promise.resolve()),
    ).rejects.toEqual(new ProviderRequestGuardError("BUSY"));
    release();
    await first;
    await guard.run("provider", () => Promise.resolve());
    await expect(
      guard.run("provider", () => Promise.resolve()),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("opens after three failures and resets after the cool-down", async () => {
    let now = 1_000;
    const guard = new ProviderRequestGuard(() => now);
    const fail = () => Promise.reject(new Error("synthetic provider failure"));
    for (let count = 0; count < 3; count += 1)
      await expect(guard.run("provider", fail)).rejects.toThrow(
        "synthetic provider failure",
      );
    await expect(
      guard.run("provider", () => Promise.resolve()),
    ).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
    now += 30_001;
    await expect(
      guard.run("provider", () => Promise.resolve("ok")),
    ).resolves.toBe("ok");
  });
});
