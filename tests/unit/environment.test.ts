import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "@/infrastructure/config/environment-schema";

describe("server environment", () => {
  it("uses safe local file-storage defaults", () => {
    const environment = parseServerEnvironment({});
    expect(environment.APP_BIND_HOST).toBe("127.0.0.1");
    expect(environment.APP_BASE_URL).toBe("http://127.0.0.1:3000");
    expect(environment.DATABASE_PATH).toBe("./var/vitae.sqlite");
    expect(environment.ARTIFACT_STORAGE_ROOT).toBe("./var/private/artifacts");
    expect(environment.TELEMETRY_ENABLED).toBe(false);
    expect(environment.PARSER_MODE).toBe("inline");
    expect(environment.JOB_FETCH_MODE).toBe("inline");
  });

  it("rejects a non-loopback bind", () => {
    expect(() => parseServerEnvironment({ APP_BIND_HOST: "0.0.0.0" })).toThrow(
      /loopback/u,
    );
  });

  it("rejects a non-loopback public URL", () => {
    expect(() =>
      parseServerEnvironment({ APP_BASE_URL: "http://192.0.2.10:3000" }),
    ).toThrow(/loopback/u);
  });

  it("allows inline bounded parsing and URL retrieval in production local mode", () => {
    const environment = parseServerEnvironment({
      NODE_ENV: "production",
      APP_BIND_HOST: "127.0.0.1",
      APP_BASE_URL: "http://127.0.0.1:3000",
      PARSER_MODE: "inline",
      JOB_FETCH_MODE: "inline",
    });
    expect(environment.NODE_ENV).toBe("production");
  });
});
