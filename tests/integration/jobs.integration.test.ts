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
import {
  FilesystemArtifactStore,
  sourceStorageKey,
} from "@/infrastructure/artifacts/filesystem-store";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import {
  ExtractionNotFoundError,
  ExtractionRepository,
} from "@/modules/extraction/repository";
import {
  JobConflictError,
  JobDocumentDependencyError,
  JobNotFoundError,
  JobRepository,
} from "@/modules/jobs/repository";
import { DocumentRepository } from "@/modules/documents/repository";
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

  it("previews and atomically deletes complete job aggregates", async () => {
    const owned = await repository.createFromText(first, {
      title: "Disposable job aggregate",
      company: "Example Company",
      text: "Review privacy controls",
    });
    const current = (await repository.get(first, owned)).revisions[0]!;
    await repository.revise(
      first,
      owned,
      current.id,
      "Review privacy and deletion controls",
    );
    const latest = (await repository.get(first, owned)).revisions[0]!;
    const requirementSet = await runtimePool.query<{ id: string }>(
      `INSERT INTO job_requirement_sets
         (workspace_id,job_posting_revision_id,revision_number,method,status,metadata,created_by_user_id,reviewed_at)
       VALUES ($1,$2,1,'manual','reviewed','{}',$3,now()) RETURNING id`,
      [first.workspaceId, latest.id, first.userId],
    );
    const matchRun = await runtimePool.query<{ id: string }>(
      `INSERT INTO requirement_match_runs
         (workspace_id,requirement_set_id,revision_number,algorithm_version,input_hash,eligible_fact_count,created_by_user_id)
       VALUES ($1,$2,1,'synthetic@1',$3,0,$4) RETURNING id`,
      [
        first.workspaceId,
        requirementSet.rows[0]!.id,
        `sha256:${"e".repeat(64)}`,
        first.userId,
      ],
    );
    const documents = new DocumentRepository(runtimePool);
    const documentId = await documents.create(first, {
      kind: "resume",
      title: "Disposable job aggregate document",
    });
    const document = await documents.get(first, documentId);
    await runtimePool.query(
      `INSERT INTO tailoring_runs
         (workspace_id,kind,document_id,base_version_id,job_posting_revision_id,
          requirement_set_id,match_run_id,status,idempotency_key,manifest,created_by_user_id)
       VALUES ($1,'resume',$2,$3,$4,$5,$6,'ready',$7,'{}',$8)`,
      [
        first.workspaceId,
        documentId,
        document.currentVersion.id,
        latest.id,
        requirementSet.rows[0]!.id,
        matchRun.rows[0]!.id,
        crypto.randomUUID(),
        first.userId,
      ],
    );
    await runtimePool.query(
      `INSERT INTO ats_reports
         (workspace_id,document_version_id,job_posting_revision_id,requirement_set_id,
          ruleset_version,document_hash,job_hash,input_hash,evaluated_weight,overall_score_basis_points,blocker_count)
       VALUES ($1,$2,$3,$4,'synthetic@1',$5,$6,$7,100,7500,0)`,
      [
        first.workspaceId,
        document.currentVersion.id,
        latest.id,
        requirementSet.rows[0]!.id,
        document.currentVersion.content_hash,
        latest.content_hash,
        `sha256:${"f".repeat(64)}`,
      ],
    );
    const foreign = await repository.createFromText(second, {
      title: "Foreign disposable job",
      company: "Other Company",
      text: "This job belongs to another workspace",
    });

    expect(await repository.dependencyPreview(first, owned)).toMatchObject({
      revisions: 2,
      requirementSets: 1,
      matchingRuns: 1,
      tailoringRuns: 1,
      atsReports: 1,
      acceptedDocumentVersions: 0,
    });
    await expect(
      repository.deleteMany(first, [owned, foreign]),
    ).rejects.toBeInstanceOf(JobNotFoundError);
    await expect(repository.get(first, owned)).resolves.toBeDefined();

    await repository.deleteMany(first, [owned]);
    await expect(repository.get(first, owned)).rejects.toBeInstanceOf(
      JobNotFoundError,
    );
  });

  it("blocks job deletion when an accepted document version needs its tailoring provenance", async () => {
    const jobId = await repository.createFromText(first, {
      title: "Document-backed job",
      company: "Example Company",
      text: "Build evidence-grounded documents",
    });
    const revision = (await repository.get(first, jobId)).revisions[0]!;
    const requirementSet = await runtimePool.query<{ id: string }>(
      `INSERT INTO job_requirement_sets
         (workspace_id,job_posting_revision_id,revision_number,method,status,metadata,created_by_user_id,reviewed_at)
       VALUES ($1,$2,1,'manual','reviewed','{}',$3,now()) RETURNING id`,
      [first.workspaceId, revision.id, first.userId],
    );
    const matchRun = await runtimePool.query<{ id: string }>(
      `INSERT INTO requirement_match_runs
         (workspace_id,requirement_set_id,revision_number,algorithm_version,input_hash,eligible_fact_count,created_by_user_id)
       VALUES ($1,$2,1,'synthetic@1',$3,0,$4) RETURNING id`,
      [
        first.workspaceId,
        requirementSet.rows[0]!.id,
        `sha256:${"d".repeat(64)}`,
        first.userId,
      ],
    );
    const documents = new DocumentRepository(runtimePool);
    const documentId = await documents.create(first, {
      kind: "resume",
      title: "Accepted job deletion blocker",
    });
    const document = await documents.get(first, documentId);
    const run = await runtimePool.query<{ id: string }>(
      `INSERT INTO tailoring_runs
         (workspace_id,kind,document_id,base_version_id,job_posting_revision_id,
          requirement_set_id,match_run_id,status,idempotency_key,manifest,created_by_user_id)
       VALUES ($1,'resume',$2,$3,$4,$5,$6,'ready',$7,'{}',$8) RETURNING id`,
      [
        first.workspaceId,
        documentId,
        document.currentVersion.id,
        revision.id,
        requirementSet.rows[0]!.id,
        matchRun.rows[0]!.id,
        crypto.randomUUID(),
        first.userId,
      ],
    );
    await runtimePool.query(
      `INSERT INTO tailoring_suggestions
         (workspace_id,run_id,sequence,operation,target_section_id,rationale,task_id,task_version,status,decided_by_user_id,decided_at,accepted_version_id)
       VALUES ($1,$2,1,'remove_block','synthetic-section','Synthetic fixture','AI-06','1','accepted',$3,now(),$4)`,
      [
        first.workspaceId,
        run.rows[0]!.id,
        first.userId,
        document.currentVersion.id,
      ],
    );

    expect(await repository.dependencyPreview(first, jobId)).toMatchObject({
      tailoringRuns: 1,
      acceptedDocumentVersions: 1,
    });
    await expect(repository.deleteMany(first, [jobId])).rejects.toBeInstanceOf(
      JobDocumentDependencyError,
    );
    await expect(repository.get(first, jobId)).resolves.toBeDefined();
  });

  it("creates a file-provenance snapshot once and blocks career extraction", async () => {
    const sourceDocumentId = crypto.randomUUID();
    const source = await runtimePool.query<{ id: string }>(
      `INSERT INTO source_documents (id,workspace_id,uploaded_by_user_id,purpose,original_name,declared_media_type,detected_media_type,byte_size,content_hash,storage_key,status,extracted_text,parser_version,processed_at)
       VALUES ($1,$2,$3,'job_description','synthetic-job.txt','text/plain','text/plain',32,$4,$5,'ready','Synthetic employer requirement','plain-text@1',now()) RETURNING id`,
      [
        sourceDocumentId,
        first.workspaceId,
        first.userId,
        `sha256:${"b".repeat(64)}`,
        sourceStorageKey(first.workspaceId, sourceDocumentId),
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
    expect(
      await repository.dependencyPreview(first, completed.job_posting_id!),
    ).toMatchObject({ urlImports: 1 });
    await repository.deleteMany(first, [completed.job_posting_id!]);
    await expect(imports.get(first, importId)).rejects.toBeInstanceOf(
      JobUrlImportNotFoundError,
    );
  });
});
