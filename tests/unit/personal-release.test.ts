import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("personal no-account release", () => {
  it("binds the application to loopback and uses a local SQLite data folder", async () => {
    const [powershell, shell] = await Promise.all([
      readFile("scripts/personal/vitae.ps1", "utf8"),
      readFile("scripts/personal/vitae.sh", "utf8"),
    ]);

    for (const source of [powershell, shell]) {
      expect(source).toContain("127.0.0.1");
      expect(source).toContain("DATABASE_PATH");
      expect(source).toContain("MIGRATIONS_PATH");
      expect(source).toContain("vitae.sqlite");
      expect(source).toContain("TELEMETRY_ENABLED");
      expect(source).not.toMatch(/docker|postgres/iu);
      expect(source).not.toMatch(/OPENAI_API_KEY|ANTHROPIC/iu);
    }

    expect(powershell).toContain('Join-Path $root "app\\db\\migrations"');
    expect(powershell).toContain("$env:MIGRATIONS_PATH = $migrationsPath");
    expect(powershell).toContain("$handler.UseProxy = $false");
    expect(powershell).toContain("Get-Content -Raw -LiteralPath $log");
    expect(shell).toContain('MIGRATIONS_PATH="$ROOT/app/db/migrations"');
    expect(shell).toContain("DATABASE_PATH MIGRATIONS_PATH");
  });

  it("creates private local settings and preserves the data folder on stop", async () => {
    const [powershell, shell, packager] = await Promise.all([
      readFile("scripts/personal/vitae.ps1", "utf8"),
      readFile("scripts/personal/vitae.sh", "utf8"),
      readFile("scripts/personal/package.ps1", "utf8"),
    ]);

    expect(powershell).toContain("RandomNumberGenerator");
    expect(powershell).toContain("icacls.exe");
    expect(powershell).toContain("LOCALAPPDATA");
    expect(powershell).toContain("Your local data was preserved");
    expect(shell).toContain("chmod 600");
    expect(shell).toContain("/dev/urandom");
    expect(shell).toContain("Your local data was preserved");

    expect(packager).toContain("runtime/node.exe");
    expect(packager).toContain("app/server.js");
    expect(packager).toContain("app/db/migrations/0001_initial.sql");
    expect(packager).toContain("app/db/migrations/0002_integrity_guards.sql");
    expect(packager).toContain("Node.js runtime checksum verification failed");
    expect(packager).toContain("Release bundle is missing required file");
    expect(packager).toContain('$excludedStandaloneNames = @("node_modules"');
    expect(packager).toContain(
      '".release", "dist", "tmp", "var", ".vitae-stack"',
    );
  });
});
