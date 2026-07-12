// @vitest-environment node

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Pool } from "@/infrastructure/database/sqlite-pool";
import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../helpers/sqlite-test-database";
import { parseServerEnvironment } from "@/infrastructure/config/environment-schema";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { decryptCredential } from "@/modules/providers/credential-envelope";
import {
  ProviderConfigurationConflictError,
  ProviderConfigurationNotFoundError,
  ProviderConfigurationRepository,
} from "@/modules/providers/repository";
import { ProviderConfigurationService } from "@/modules/providers/service";

let testDatabase: SqliteTestDatabase;
let runtimePool: Pool;
let repository: ProviderConfigurationRepository;
let service: ProviderConfigurationService;
let first: WorkspacePrincipal;
let second: WorkspacePrincipal;
const masterKey = randomBytes(32).toString("base64");

async function principal(label: string): Promise<WorkspacePrincipal> {
  const user = await runtimePool.query<{ id: string }>(
    "INSERT INTO users (email,name) VALUES ($1,$2) RETURNING id",
    [`${label}@example.test`, label],
  );
  const workspace = await runtimePool.query<{ id: string }>(
    "INSERT INTO workspaces (owner_user_id,name) VALUES ($1,$2) RETURNING id",
    [user.rows[0]!.id, `${label} workspace`],
  );
  await runtimePool.query(
    "INSERT INTO workspace_memberships (workspace_id,user_id) VALUES ($1,$2)",
    [workspace.rows[0]!.id, user.rows[0]!.id],
  );
  await runtimePool.query(
    "INSERT INTO career_profiles (workspace_id,display_name) VALUES ($1,$2)",
    [workspace.rows[0]!.id, label],
  );
  return {
    authenticatedAt: new Date(),
    mode: "trusted-local",
    userId: user.rows[0]!.id,
    workspaceId: workspace.rows[0]!.id,
  };
}

beforeAll(async () => {
  testDatabase = await createSqliteTestDatabase("providers");
  runtimePool = testDatabase.pool;
  repository = new ProviderConfigurationRepository(runtimePool);
  service = new ProviderConfigurationService(
    repository,
    parseServerEnvironment({
      NODE_ENV: "test",
      CREDENTIAL_ENCRYPTION_KEY: masterKey,
      CREDENTIAL_KEY_VERSION: "1",
    }),
  );
  first = await principal("providers-first");
  second = await principal("providers-second");
}, 120_000);

afterAll(async () => {
  await testDatabase?.cleanup();
});

describe("model provider configuration", () => {
  it("encrypts a write-only credential and isolates workspace reads", async () => {
    const secret = "synthetic-provider-secret-never-log";
    const id = await service.create(first, {
      label: "Synthetic OpenAI-compatible",
      kind: "openai_compatible",
      baseUrl: "https://models.example/v1",
      authType: "encrypted",
      credential: secret,
    });
    const summaries = await repository.list(first);
    expect(summaries[0]).toMatchObject({
      id,
      credential_last_four: "-log",
      auth_type: "encrypted",
    });
    expect(JSON.stringify(summaries)).not.toContain(secret);
    const stored = await repository.getPrivate(first, id);
    expect(stored.credential_ciphertext).not.toContain(secret);
    expect(
      decryptCredential(
        {
          ciphertext: stored.credential_ciphertext!,
          nonce: stored.credential_nonce!,
          tag: stored.credential_tag!,
          keyVersion: stored.credential_key_version!,
          lastFour: stored.credential_last_four!,
        },
        masterKey,
        {
          workspaceId: first.workspaceId,
          configurationId: id,
          providerKind: "openai_compatible",
        },
      ),
    ).toBe(secret);
    await expect(repository.getPrivate(second, id)).rejects.toBeInstanceOf(
      ProviderConfigurationNotFoundError,
    );
    const audit = await runtimePool.query<{ metadata: unknown }>(
      "SELECT metadata FROM audit_events WHERE target_id=$1",
      [id],
    );
    expect(JSON.stringify(audit.rows)).not.toContain(secret);
  });

  it("rotates with optimistic concurrency and immutable credential context", async () => {
    const id = await service.create(first, {
      label: "Synthetic rotation",
      kind: "ollama",
      baseUrl: "https://ollama.example/",
      authType: "encrypted",
      credential: "synthetic-old-secret",
    });
    const before = await repository.getPrivate(first, id);
    await service.rotateCredential(
      first,
      id,
      "synthetic-new-secret",
      before.revision,
    );
    const after = await repository.getPrivate(first, id);
    expect(after.credential_ciphertext).not.toBe(before.credential_ciphertext);
    expect(after.credential_last_four).toBe("cret");
    await expect(
      runtimePool.query(
        "UPDATE model_provider_configurations SET workspace_id=$2 WHERE id=$1",
        [id, second.workspaceId],
      ),
    ).rejects.toThrow();
  });

  it("does not let a stale capability test certify a rotated credential", async () => {
    const id = await service.create(first, {
      label: "Synthetic stale capability",
      kind: "openai_compatible",
      baseUrl: "https://models.example/v1",
      authType: "encrypted",
      credential: "synthetic-before-test",
    });
    const tested = await repository.getPrivate(first, id);
    await service.rotateCredential(
      first,
      id,
      "synthetic-after-test",
      tested.revision,
    );

    await expect(
      repository.recordCapabilityResult(
        first,
        id,
        tested.revision,
        {
          schemaVersion: 1,
          structuredOutput: true,
          usage: true,
          refusal: true,
          testedAt: new Date().toISOString(),
          warnings: [],
        },
        true,
      ),
    ).rejects.toBeInstanceOf(ProviderConfigurationConflictError);
    const current = await repository.getPrivate(first, id);
    expect(current).toMatchObject({
      revision: tested.revision + 1,
      status: "unverified",
      last_tested_at: null,
    });
  });
});
