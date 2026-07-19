import { describe, expect, it } from "vitest";

import { ProviderRequestError } from "@/modules/providers/contracts";
import { providerCapabilityTestFailure } from "@/modules/providers/service";

describe("provider capability test diagnostics", () => {
  it.each([
    ["AUTHENTICATION", "authentication"],
    ["RATE_LIMITED", "rate_limited"],
    ["TIMEOUT", "timeout"],
    ["INVALID_REQUEST", "invalid_request"],
    ["INVALID_RESPONSE", "invalid_response"],
    ["UNAVAILABLE", "unavailable"],
  ] as const)("maps %s to a safe %s diagnostic", (code, expected) => {
    expect(providerCapabilityTestFailure(new ProviderRequestError(code))).toBe(
      expected,
    );
  });

  it("does not expose unknown provider errors", () => {
    expect(
      providerCapabilityTestFailure(new Error("secret provider detail")),
    ).toBe("unknown");
  });

  it("keeps the upstream HTTP status separate from provider response content", () => {
    const error = new ProviderRequestError("UNAVAILABLE", 404);
    expect(error.httpStatus).toBe(404);
    expect(error.message).not.toContain("404");
  });
});
