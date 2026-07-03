// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Pool } from "@/infrastructure/database/sqlite-pool";
import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../helpers/sqlite-test-database";
import { parseServerEnvironment } from "@/infrastructure/config/environment-schema";
import { FilesystemArtifactStore } from "@/infrastructure/artifacts/filesystem-store";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import {
  ExtractionNotFoundError,
  ExtractionRepository,
} from "@/modules/extraction/repository";
import {
  JobConflictError,
  JobNotFoundError,
  JobRepository,
} from "@/modules/jobs/repository";
import {
  JobUrlImportNotFoundError,
  JobUrlImportRepository,
} from "@/modules/job-fetch/repository";
import { JobUrlImportService } from "@/modules/job-fetch/service";
import { jobFetchMessageKey } from "@/modules/job-fetch/protocol";

let testDatabase: SqliteTestDatabase;
let runtimePool: Pool;
let repository: JobRepository;
let first: WorkspacePrincipal;
let second: WorkspacePrincipal;
let queueRoot: string;

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
  testDatabase = await createSqliteTestDatabase("jobs");
  runtimePool = testDatabase.pool;
  repository = new JobRepository(runtimePool);
  queueRoot = await mkdtemp(path.join(tmpdir(), "vitae-job-fetch-"));
  first = await principal("jobs-first");
  second = await principal("jobs-second");
}, 120_000);

afterAll(async () => {
  await testDatabase?.cleanup();
  if (queueRoot) await rm(queueRoot, { recursive: true, force: true });
});

describe("immutable job-description snapshots", () => {
  it("creates idempotent pasted snapshots and isolates workspaces", async () => {
    const input = {
      title: "Synthetic staff engineer",
      company: "Example Company",
      text: "Build private systems\r\nReview deterministic controls",
      idempotencyKey: crypto.randomUUID(),
    };
    const id = await repository.createFromText(first, input);
    expect(await repository.createFromText(first, input)).toBe(id);
    const job = await repository.get(first, id);
    expect(job.revisions[0]).toMatchObject({
      input_method: "text",
      revision_number: 1,
      normalized_text: "Build private systems\nReview deterministic controls",
    });
    await expect(repository.get(second, id)).rejects.toBeInstanceOf(
      JobNotFoundError,
    );
    const audit = await runtimePool.query<{ metadata: unknown }>(
      "SELECT metadata FROM audit_events WHERE target_id=$1",
      [id],
    );
    expect(JSON.stringify(audit.rows)).not.toContain("Build private systems");
  });

  it("creates immutable child corrections and rejects stale writes", async () => {
    const id = await repository.createFromText(first, {
      title: "Synthetic correction fixture",
      company: "",
      text: "Original synthetic description",
    });
    const before = await repository.get(first, id);
    const parent = before.revisions[0]!;
    const revisionId = await repository.revise(
      first,
      id,
      parent.id,
      "Corrected synthetic description",
    );
    const after = await repository.get(first, id);
    expect(after.revisions[0]).toMatchObject({
      id: revisionId,
      parent_revision_id: parent.id,
      revision_number: 2,
    });
    expect(after.revisions[1]!.normalized_text).toBe(
      "Original synthetic description",
    );
    await expect(
      repository.revise(first, id, parent.id, "Stale overwrite"),
    ).rejects.toBeInstanceOf(JobConflictError);
    await expect(
      runtimePool.query(
        "UPDATE job_posting_revisions SET normalized_text='tampered' WHERE id=$1",
        [parent.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("creates a file-provenance snapshot once and blocks career extraction", async () => {
    const source = await runtimePool.query<{ id: string }>(
      `INSERT INTO source_documents (workspace_id,uploaded_by_user_id,purpose,original_name,declared_media_type,detected_media_type,byte_size,content_hash,storage_key,status,extracted_text,parser_version,processed_at)
       VALUES ($1,$2,'job_description','synthetic-job.txt','text/plain','text/plain',32,$3,$4,'ready','Synthetic employer requirement','plain-text@1',now()) RETURNING id`,
      [
        first.workspaceId,
        first.userId,
        `sha256:${"b".repeat(64)}`,
        `${first.workspaceId}/${crypto.randomUUID()}`,
      ],
    );
    const sourceId = source.rows[0]!.id;
    const id = await repository.createFromSource(first, sourceId, {
      title: "Synthetic file role",
      company: "Example Company",
    });
    expect(
      await repository.createFromSource(first, sourceId, {
        title: "Duplicate submit",
        company: "",
      }),
    ).toBe(id);
    expect((await repository.get(first, id)).revisions[0]).toMatchObject({
      input_method: "file",
      source_document_id: sourceId,
      source_available: true,
    });
    await expect(
      new ExtractionRepository(runtimePool).createDeterministicBatch(
        first,
        sourceId,
      ),
    ).rejects.toBeInstanceOf(ExtractionNotFoundError);
  });

  it("consumes a schema-validated sidecar result with workspace isolation", async () => {
    const imports = new JobUrlImportRepository(runtimePool);
    const service = new JobUrlImportService(
      imports,
      repository,
      parseServerEnvironment({
        NODE_ENV: "test",
        JOB_FETCH_MODE: "sidecar",
        JOB_FETCH_QUEUE_ROOT: queueRoot,
      }),
    );
    const importId = await service.start(first, {
      title: "Synthetic URL role",
      company: "Example Company",
      url: "https://example.com/jobs/synthetic",
      idempotencyKey: crypto.randomUUID(),
    });
    const pending = await imports.get(first, importId);
    await new FilesystemArtifactStore(queueRoot).putJsonAtomic(
      jobFetchMessageKey(first.workspaceId, pending.operation_id),
      {
        schemaVersion: 1,
        state: "result",
        operationId: pending.operation_id,
        ok: true,
        result: {
          requestedUrl: pending.requested_url,
          finalUrl: pending.requested_url,
          finalOrigin: "https://example.com",
          retrievedAt: new Date().toISOString(),
          contentType: "text/html",
          text: "Synthetic public job requirement",
          contentHash: `sha256:${"c".repeat(64)}`,
          redirectCount: 0,
        },
      },
    );
    const completed = await service.refresh(first, importId);
    expect(completed.status).toBe("succeeded");
    expect(completed.job_posting_id).toBeTruthy();
    const job = await repository.get(first, completed.job_posting_id!);
    expect(job.revisions[0]).toMatchObject({
      input_method: "url",
      normalized_text: "Synthetic public job requirement",
      metadata: {
        retrieval: {
          requestedUrl: pending.requested_url,
          finalOrigin: "https://example.com",
        },
      },
    });
    await expect(imports.get(second, importId)).rejects.toBeInstanceOf(
      JobUrlImportNotFoundError,
    );
  });
});
