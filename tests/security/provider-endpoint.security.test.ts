import { describe, expect, it } from "vitest";

import {
  parseProviderPrivateOriginAllowlist,
  requirePublicAddresses,
  UnsafeProviderEndpointError,
  validateProviderBaseUrl,
} from "../../src/modules/providers/endpoint-policy";

describe("model provider endpoint policy", () => {
  it("accepts public HTTPS and normalizes a base path", () => {
    expect(
      validateProviderBaseUrl("https://models.example/v1", new Set()),
    ).toEqual({
      baseUrl: new URL("https://models.example/v1/"),
      privateOriginAllowed: false,
    });
  });

  it.each([
    "http://models.example/v1/",
    "https://127.0.0.1/v1/",
    "https://[::1]/v1/",
    "https://localhost/v1/",
    "https://user:pass@models.example/v1/",
    "https://models.example:8443/v1/",
    "file:///tmp/provider",
  ])("blocks an unsafe unlisted endpoint: %s", (value) => {
    expect(() => validateProviderBaseUrl(value, new Set())).toThrow(
      UnsafeProviderEndpointError,
    );
  });

  it("permits an exact operator-allowlisted local origin only", () => {
    const allowed = parseProviderPrivateOriginAllowlist(
      "http://127.0.0.1:11434,http://ollama:11434",
    );
    expect(
      validateProviderBaseUrl("http://127.0.0.1:11434/api", allowed),
    ).toMatchObject({ privateOriginAllowed: true });
    expect(() =>
      validateProviderBaseUrl("http://127.0.0.1:11435/api", allowed),
    ).toThrow(UnsafeProviderEndpointError);
    expect(() =>
      validateProviderBaseUrl("http://ollama.evil:11434/api", allowed),
    ).toThrow(UnsafeProviderEndpointError);
  });

  it("rejects malformed allowlist entries", () => {
    expect(() =>
      parseProviderPrivateOriginAllowlist("http://ollama:11434/api"),
    ).toThrow(UnsafeProviderEndpointError);
    expect(() =>
      parseProviderPrivateOriginAllowlist("http://user:pass@ollama:11434"),
    ).toThrow(UnsafeProviderEndpointError);
  });

  it("rejects DNS answers when any address is non-public", () => {
    expect(() =>
      requirePublicAddresses([
        { address: "93.184.216.34" },
        { address: "127.0.0.1" },
      ]),
    ).toThrow(UnsafeProviderEndpointError);
    expect(() =>
      requirePublicAddresses([{ address: "93.184.216.34" }]),
    ).not.toThrow();
  });
});
