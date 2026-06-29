import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "@/infrastructure/config/environment-schema";

describe("server environment", () => {
  it("uses safe local development defaults", () => {
    const environment = parseServerEnvironment({});

    expect(environment.APP_BIND_HOST).toBe("127.0.0.1");
    expect(environment.TELEMETRY_ENABLED).toBe(false);
    expect(environment.DATABASE_URL).toMatch(/^postgresql:\/\//);
  });

  it("rejects a non-PostgreSQL database URL", () => {
    expect(() =>
      parseServerEnvironment({ DATABASE_URL: "sqlite:///tmp/vitae.db" }),
    ).toThrow();
  });

  it("rejects trusted-local mode on a non-loopback bind", () => {
    expect(() =>
      parseServerEnvironment({
        AUTH_MODE: "trusted-local",
        APP_BIND_HOST: "0.0.0.0",
        BETTER_AUTH_URL: "http://127.0.0.1:3000",
      }),
    ).toThrow(/loopback/u);
  });

  it("requires an operator authentication secret in production", () => {
    expect(() => parseServerEnvironment({ NODE_ENV: "production" })).toThrow(
      /authentication secret/u,
    );
  });

  it("requires an explicit acknowledgement for production trusted-local mode", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "production",
        AUTH_MODE: "trusted-local",
        APP_BIND_HOST: "127.0.0.1",
        BETTER_AUTH_URL: "http://127.0.0.1:3000",
        BETTER_AUTH_SECRET: "synthetic-production-secret-at-least-32-bytes",
      }),
    ).toThrow(/acknowledgement/u);
  });
});
