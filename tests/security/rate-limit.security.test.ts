// @vitest-environment node

import { describe, expect, it } from "vitest";

import { applicationRateLimitKey } from "@/infrastructure/security/rate-limit";

describe("application rate-limit identifiers", () => {
  it("stores only scoped one-way subject identifiers", () => {
    const subject = "00000000-0000-4000-8000-000000000001";
    const key = applicationRateLimitKey("provider-task", subject);
    expect(key).toMatch(/^app:provider-task:[0-9a-f]{64}$/u);
    expect(key).not.toContain(subject);
    expect(applicationRateLimitKey("provider-task", subject)).toBe(key);
    expect(applicationRateLimitKey("provider-test", subject)).not.toBe(key);
  });

  it("rejects uncontrolled scope names", () => {
    expect(() => applicationRateLimitKey("bad scope", "subject")).toThrow();
  });
});
