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
import { DocumentRepository } from "@/modules/documents/repository";
import { JobRepository } from "@/modules/jobs/repository";
import { decryptCredential } from "@/modules/providers/credential-envelope";
import {
  ProviderConfigurationConflictError,
  ProviderConfigurationInUseError,
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
  it("lists only tested providers assigned to the requested AI task", async () => {
    const ai01 = await service.create(first, {
      label: "Z synthetic AI-01 provider",
      kind: "openai_compatible",
      baseUrl: "https://ai01.example/v1/",
      authType: "none",
    });
    let configuration = await repository.getPrivate(first, ai01);
    await repository.recordCapabilityResult(
      first,
      ai01,
      configuration.revision,
      {
        schemaVersion: 1,
        structuredOutput: true,
        usage: false,
        refusal: false,
        testedAt: new Date().toISOString(),
        warnings: [],
      },
      true,
    );
    configuration = await repository.getPrivate(first, ai01);
    await repository.assignTask(
      first,
      ai01,
      "AI-01",
      "synthetic-model",
      configuration.revision,
    );
    const ai02Only = await service.create(first, {
      label: "Z synthetic AI-02-only provider",
      kind: "openai_compatible",
      baseUrl: "https://ai02.example/v1/",
      authType: "none",
    });
    configuration = await repository.getPrivate(first, ai02Only);
    await repository.recordCapabilityResult(
      first,
      ai02Only,
      configuration.revision,
      {
        schemaVersion: 1,
        structuredOutput: true,
        usage: false,
        refusal: false,
        testedAt: new Date().toISOString(),
        warnings: [],
      },
      true,
    );
    configuration = await repository.getPrivate(first, ai02Only);
    await repository.assignTask(
      first,
      ai02Only,
      "AI-02",
      "synthetic-model",
      configuration.revision,
    );

    expect(await repository.listReadyForTask(first, "AI-01")).toEqual([
      expect.objectContaining({ id: ai01, status: "available" }),
    ]);
    expect(await repository.listReadyForTask(second, "AI-01")).toEqual([]);

    configuration = await repository.getPrivate(first, ai01);
    await repository.unassignTask(first, ai01, "AI-01", configuration.revision);
    expect((await repository.getPrivate(first, ai01)).task_assignments).toEqual(
      {},
    );
    expect(await repository.listReadyForTask(first, "AI-01")).toEqual([]);

    configuration = await repository.getPrivate(first, ai01);
    await repository.assignTasks(
      first,
      ai01,
      ["AI-01", "AI-02"],
      "synthetic-bulk-model",
      configuration.revision,
    );
    expect((await repository.getPrivate(first, ai01)).task_assignments).toEqual(
      {
        "AI-01": "synthetic-bulk-model",
        "AI-02": "synthetic-bulk-model",
      },
    );
  });

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

  it("deletes an unused provider but preserves providers referenced by tailoring history", async () => {
    const disposable = await service.create(first, {
      label: "Synthetic disposable provider",
      kind: "openai_compatible",
      baseUrl: "https://disposable.example/v1/",
      authType: "encrypted",
      credential: "synthetic-disposable-secret",
    });
    const disposableConfiguration = await repository.getPrivate(
      first,
      disposable,
    );
    await repository.delete(
      first,
      disposable,
      disposableConfiguration.revision,
    );
    await expect(
      repository.getPrivate(first, disposable),
    ).rejects.toBeInstanceOf(ProviderConfigurationNotFoundError);
    const deletionAudit = await runtimePool.query<{
      action: string;
      metadata: unknown;
    }>(
      "SELECT action,metadata FROM audit_events WHERE target_id=$1 AND action='provider.delete'",
      [disposable],
    );
    expect(deletionAudit.rows).toEqual([
      {
        action: "provider.delete",
        metadata: { deletedCredential: true },
      },
    ]);
    expect(JSON.stringify(deletionAudit.rows)).not.toContain(
      "synthetic-disposable-secret",
    );

    const retained = await service.create(first, {
      label: "Synthetic retained provider",
      kind: "openai_compatible",
      baseUrl: "https://retained.example/v1/",
      authType: "none",
    });
    const documents = new DocumentRepository(runtimePool);
    const documentId = await documents.create(first, {
      kind: "resume",
      title: "Provider deletion history fixture",
    });
    const document = await documents.get(first, documentId);
    const jobs = new JobRepository(runtimePool);
    const jobId = await jobs.createFromText(first, {
      title: "Provider deletion history role",
      company: "Example Company",
      text: "Preserve provider provenance",
    });
    const jobRevision = (await jobs.get(first, jobId)).revisions[0]!;
    const requirementSet = await runtimePool.query<{ id: string }>(
      `INSERT INTO job_requirement_sets
         (workspace_id,job_posting_revision_id,revision_number,method,status,metadata,created_by_user_id,reviewed_at)
       VALUES ($1,$2,1,'manual','reviewed','{}',$3,now()) RETURNING id`,
      [first.workspaceId, jobRevision.id, first.userId],
    );
    const matchRun = await runtimePool.query<{ id: string }>(
      `INSERT INTO requirement_match_runs
         (workspace_id,requirement_set_id,revision_number,algorithm_version,input_hash,eligible_fact_count,created_by_user_id)
       VALUES ($1,$2,1,'provider-deletion@1',$3,0,$4) RETURNING id`,
      [
        first.workspaceId,
        requirementSet.rows[0]!.id,
        `sha256:${"d".repeat(64)}`,
        first.userId,
      ],
    );
    await runtimePool.query(
      `INSERT INTO tailoring_runs
         (workspace_id,kind,document_id,base_version_id,job_posting_revision_id,
          requirement_set_id,match_run_id,provider_configuration_id,model,status,
          idempotency_key,manifest,created_by_user_id)
       VALUES ($1,'resume',$2,$3,$4,$5,$6,$7,'synthetic-model','ready',$8,'{}',$9)`,
      [
        first.workspaceId,
        documentId,
        document.currentVersion.id,
        jobRevision.id,
        requirementSet.rows[0]!.id,
        matchRun.rows[0]!.id,
        retained,
        crypto.randomUUID(),
        first.userId,
      ],
    );

    const retainedSummary = (await repository.list(first)).find(
      (configuration) => configuration.id === retained,
    );
    expect(retainedSummary?.tailoring_run_count).toBe(1);
    await expect(
      repository.delete(second, retained, retainedSummary!.revision),
    ).rejects.toBeInstanceOf(ProviderConfigurationNotFoundError);
    await expect(
      repository.delete(first, retained, retainedSummary!.revision),
    ).rejects.toBeInstanceOf(ProviderConfigurationInUseError);
    await expect(repository.getPrivate(first, retained)).resolves.toMatchObject(
      {
        id: retained,
      },
    );
  });
});
