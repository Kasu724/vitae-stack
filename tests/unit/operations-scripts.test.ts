import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("reference backup and restore scripts", () => {
  it("creates one coordinated recipient-encrypted database/artifact pair", async () => {
    const source = await readFile("scripts/operations/backup.sh", "utf8");
    expect(source).toContain("set -eu");
    expect(source.indexOf("docker compose stop")).toBeLessThan(
      source.indexOf("pg_dump"),
    );
    expect(source).toContain("age --encrypt --recipients-file");
    expect(source).toContain("database.dump.age");
    expect(source).toContain("artifacts.tar.gz.age");
    expect(source).toContain("-C /var/lib/vitae/artifacts -czf - .");
    expect(source).toContain(
      "sha256sum database.dump.age artifacts.tar.gz.age",
    );
    expect(source).toContain("--user 0 --cap-add DAC_READ_SEARCH");
    expect(source).toContain("deletion_tombstones=included-in-artifacts");
    expect(source).not.toMatch(/PASSPHRASE|openssl|aes-256-cbc/iu);
  });

  it("refuses destructive restore targets and replays deletion before app", async () => {
    const source = await readFile("scripts/operations/restore.sh", "utf8");
    expect(source).toContain("sha256sum -c SHA256SUMS");
    expect(source).toContain("age --decrypt --identity");
    expect(source).toContain("Restore refused: target database is not empty");
    expect(source).toContain("up -d --wait postgres");
    expect(source).toContain(
      "Restore refused: target artifact volume is not empty",
    );
    expect(source).toContain("artifact archive contains an unsafe path");
    expect(source).toContain("artifact archive could not be inspected");
    expect(source.indexOf("up -d deletion-worker")).toBeLessThan(
      source.indexOf("up -d app parser job-fetcher"),
    );
    expect(source).toContain("state IN ('pending','running')");
  });

  it("bootstraps database roles from escaped operator variables", async () => {
    const source = await readFile(
      "docker/postgres/init/001-runtime-roles.sh",
      "utf8",
    );
    expect(source).toContain("\\getenv owner_password VITAE_OWNER_PASSWORD");
    expect(source).toContain("\\getenv app_password VITAE_APP_PASSWORD");
    expect(source).not.toContain("--set owner_password");
    expect(source).toContain("format('ALTER ROLE vitae_owner PASSWORD %L'");
    expect(source).toContain("format('ALTER ROLE vitae_app PASSWORD %L'");
    expect(source).not.toContain("vitae-owner-dev-only");
    expect(source).not.toContain("vitae-app-dev-only");
  });
});
