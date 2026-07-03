import { describe, expect, it } from "vitest";

import { isTrustedLocalRequest } from "@/infrastructure/security/trusted-local-request";

describe("trusted-local request boundary", () => {
  it.each(["127.0.0.1:3000", "localhost:3000", "[::1]:3000"])(
    "accepts loopback authority %s",
    (host) => {
      expect(isTrustedLocalRequest(new Headers({ host }))).toBe(true);
    },
  );

  it.each(["192.168.1.20:3000", "vitae.example.test", "", "not a host"])(
    "rejects non-loopback or malformed authority %s",
    (host) => {
      expect(isTrustedLocalRequest(new Headers({ host }))).toBe(false);
    },
  );

  it("rejects RFC forwarding and non-loopback forwarded hosts", () => {
    expect(
      isTrustedLocalRequest(
        new Headers({
          host: "127.0.0.1:3000",
          forwarded: "for=192.0.2.10;host=127.0.0.1:3000",
        }),
      ),
    ).toBe(false);
    expect(
      isTrustedLocalRequest(
        new Headers({
          host: "127.0.0.1:3000",
          "x-forwarded-host": "vitae.example.test",
        }),
      ),
    ).toBe(false);
  });

  it("accepts the loopback forwarded host added by the standalone server", () => {
    expect(
      isTrustedLocalRequest(
        new Headers({
          host: "127.0.0.1:3000",
          "x-forwarded-host": "127.0.0.1:3000",
        }),
      ),
    ).toBe(true);
  });

  it("accepts the container bind authority only with the explicit orchestration acknowledgement", () => {
    const url = new URL("http://0.0.0.0:3000/api/health");
    expect(isTrustedLocalRequest(new Headers(), url)).toBe(false);
    expect(isTrustedLocalRequest(new Headers(), url, true)).toBe(true);
  });
});
