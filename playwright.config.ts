import { mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
let webServerEnvironment: Record<string, string> | undefined;
if (!process.env.PLAYWRIGHT_BASE_URL) {
  const testRoot = path.resolve("tmp");
  mkdirSync(testRoot, { recursive: true });
  const runtimeRoot = process.env.PLAYWRIGHT_RUNTIME_ROOT
    ? path.resolve(process.env.PLAYWRIGHT_RUNTIME_ROOT)
    : process.env.DATABASE_PATH
      ? path.dirname(path.resolve(process.env.DATABASE_PATH))
      : mkdtempSync(path.join(testRoot, "playwright-"));
  const assignDefault = (name: string, value: string) => {
    process.env[name] ??= value;
    return process.env[name];
  };
  webServerEnvironment = {
    APP_BASE_URL: assignDefault("APP_BASE_URL", baseURL),
    APP_BIND_HOST: assignDefault("APP_BIND_HOST", "127.0.0.1"),
    DATABASE_PATH: assignDefault(
      "DATABASE_PATH",
      path.join(runtimeRoot, "vitae.sqlite"),
    ),
    MIGRATIONS_PATH: assignDefault(
      "MIGRATIONS_PATH",
      path.resolve("db/migrations"),
    ),
    ARTIFACT_STORAGE_ROOT: assignDefault(
      "ARTIFACT_STORAGE_ROOT",
      path.join(runtimeRoot, "artifacts"),
    ),
    PARSER_QUEUE_ROOT: assignDefault(
      "PARSER_QUEUE_ROOT",
      path.join(runtimeRoot, "parser-queue"),
    ),
    JOB_FETCH_QUEUE_ROOT: assignDefault(
      "JOB_FETCH_QUEUE_ROOT",
      path.join(runtimeRoot, "job-fetch-queue"),
    ),
    PARSER_MODE: assignDefault("PARSER_MODE", "inline"),
    JOB_FETCH_MODE: assignDefault("JOB_FETCH_MODE", "inline"),
    TELEMETRY_ENABLED: assignDefault("TELEMETRY_ENABLED", "false"),
    NEXT_TELEMETRY_DISABLED: assignDefault("NEXT_TELEMETRY_DISABLED", "1"),
  };
}

export default defineConfig({
  testDir: "./tests",
  // Browser scenarios intentionally mutate one synthetic workspace. Keep them
  // serial until the fixtures allocate an isolated workspace per test.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command:
          "corepack pnpm db:migrate && corepack pnpm exec next dev --hostname 127.0.0.1",
        env: webServerEnvironment,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
