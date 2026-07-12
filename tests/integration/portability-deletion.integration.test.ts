// @vitest-environment node

import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Pool } from "@/infrastructure/database/sqlite-pool";
import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../helpers/sqlite-test-database";
import {
  exportArtifactStorageKey,
  FilesystemArtifactStore,
  sourceStorageKey,
} from "@/infrastructure/artifacts/filesystem-store";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { DocumentRepository } from "@/modules/documents/repository";
import { ExportService } from "@/modules/exports/service";
import {
  PortabilityService,
  PortabilityValidationError,
} from "@/modules/portability/service";
import { portabilityArchiveSchema, sha256 } from "@/modules/portability/domain";
import { validateArchiveSemantics } from "@/modules/portability/validation";
import { WorkspaceDeletionService } from "@/modules/privacy/workspace-deletion-service";

let testDatabase: SqliteTestDatabase;
let runtimePool: Pool;
let storageRoot: string;
let parserRoot: string;
let fetchRoot: string;

class GatedArtifactStore extends FilesystemArtifactStore {
  public readonly started: Promise<void>;
  private start!: () => void;
  private readonly released: Promise<void>;
  private releaseGate!: () => void;
  private gated = false;

  public constructor(root: string) {
    super(root);
    this.started = new Promise((resolve) => {
      this.start = resolve;
    });
    this.released = new Promise((resolve) => {
      this.releaseGate = resolve;
    });
  }

  public release(): void {
    this.releaseGate();
  }

  public override async putExclusive(
    key: string,
    bytes: Uint8Array,
  ): Promise<void> {
    if (!this.gated) {
      this.gated = true;
      this.start();
      await this.released;
    }
    await super.putExclusive(key, bytes);
  }
}

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
  testDatabase = await createSqliteTestDatabase("portability-deletion");
  runtimePool = testDatabase.pool;
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "vitae-portability-"));
  parserRoot = await mkdtemp(path.join(os.tmpdir(), "vitae-parser-delete-"));
  fetchRoot = await mkdtemp(path.join(os.tmpdir(), "vitae-fetch-delete-"));
}, 120_000);

afterAll(async () => {
  await testDatabase?.cleanup();
  for (const root of [storageRoot, parserRoot, fetchRoot])
    if (root) await rm(root, { recursive: true, force: true });
});

describe("portability and permanent deletion", () => {
  it("exports without credentials, deletes durably, and imports after a clean dry run", async () => {
    const first = await principal("portable-first");
    const profile = await runtimePool.query<{ id: string }>(
      "SELECT id FROM career_profiles WHERE workspace_id=$1",
      [first.workspaceId],
    );
    const entry = await runtimePool.query<{ id: string }>(
      `INSERT INTO career_entries (workspace_id,career_profile_id,type,title)
       VALUES ($1,$2,'project','Synthetic portable project') RETURNING id`,
      [first.workspaceId, profile.rows[0]!.id],
    );
    await runtimePool.query(
      `INSERT INTO evidence_facts
         (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
       VALUES ($1,$2,'statement',$3::jsonb,'Shipped a synthetic fixture',$4::jsonb,$5)`,
      [
        first.workspaceId,
        entry.rows[0]!.id,
        JSON.stringify({ kind: "text", text: "Shipped a synthetic fixture" }),
        JSON.stringify({ kind: "manual", label: "Synthetic fixture" }),
        first.userId,
      ],
    );
    const documentRepository = new DocumentRepository(runtimePool);
    const portableDocumentId = await documentRepository.create(first, {
      kind: "resume",
      title: "Portable synthetic resume",
    });
    const portableDocument = await documentRepository.get(
      first,
      portableDocumentId,
    );
    await runtimePool.query(
      `INSERT INTO model_provider_configurations
         (workspace_id,created_by_user_id,kind,label,base_url,auth_type,
          credential_ciphertext,credential_nonce,credential_tag,credential_key_version,credential_last_four)
       VALUES ($1,$2,'openai_compatible','Synthetic remote','https://models.example/v1/',
         'encrypted','never-export-this','nonce','tag',1,'test')`,
      [first.workspaceId, first.userId],
    );
    const sourceId = crypto.randomUUID();
    const sourceKey = sourceStorageKey(first.workspaceId, sourceId);
    const store = new FilesystemArtifactStore(storageRoot);
    await store.putExclusive(sourceKey, Buffer.from("Synthetic source bytes"));
    await runtimePool.query(
      `INSERT INTO source_documents
         (id,workspace_id,uploaded_by_user_id,purpose,original_name,declared_media_type,
          detected_media_type,byte_size,content_hash,storage_key,status,extracted_text)
       VALUES ($1,$2,$3,'resume','synthetic.txt','text/plain','text/plain',22,
         $4,$5,'ready','Synthetic source bytes')`,
      [
        sourceId,
        first.workspaceId,
        first.userId,
        "sha256:e4a09098a57b57ab2dffaab4f40d92853a838d9c6580a930bef0506de6421bb6",
        sourceKey,
      ],
    );
    const posting = await runtimePool.query<{ id: string }>(
      `INSERT INTO job_postings (workspace_id,title)
       VALUES ($1,'Synthetic deletion fixture') RETURNING id`,
      [first.workspaceId],
    );
    const postingRevision = await runtimePool.query<{ id: string }>(
      `INSERT INTO job_posting_revisions
         (workspace_id,job_posting_id,input_method,revision_number,normalized_text,
          content_hash,created_by_user_id)
       VALUES ($1,$2,'text',1,'Synthetic reviewed requirement',$3,$4)
        RETURNING id`,
      [
        first.workspaceId,
        posting.rows[0]!.id,
        sha256("Synthetic reviewed requirement"),
        first.userId,
      ],
    );
    const requirementSet = await runtimePool.query<{ id: string }>(
      `INSERT INTO job_requirement_sets
         (workspace_id,job_posting_revision_id,revision_number,method,status,
          metadata,created_by_user_id,reviewed_at)
       VALUES ($1,$2,1,'deterministic','reviewed','{}'::jsonb,$3,now())
       RETURNING id`,
      [first.workspaceId, postingRevision.rows[0]!.id, first.userId],
    );
    const requirement = await runtimePool.query<{ id: string }>(
      `INSERT INTO job_requirements
         (workspace_id,requirement_set_id,category,priority,decision,requirement_text)
       VALUES ($1,$2,'required_qualification','required','accepted',
         'Synthetic reviewed requirement') RETURNING id`,
      [first.workspaceId, requirementSet.rows[0]!.id],
    );
    const matchRun = await runtimePool.query<{ id: string }>(
      `INSERT INTO requirement_match_runs
         (workspace_id,requirement_set_id,revision_number,algorithm_version,input_hash,
          eligible_fact_count,created_by_user_id)
       VALUES ($1,$2,1,'synthetic-match@1',$3,1,$4) RETURNING id`,
      [
        first.workspaceId,
        requirementSet.rows[0]!.id,
        `sha256:${"0".repeat(64)}`,
        first.userId,
      ],
    );
    await runtimePool.query(
      `INSERT INTO tailoring_runs
         (workspace_id,kind,document_id,base_version_id,job_posting_revision_id,
          requirement_set_id,match_run_id,status,idempotency_key,manifest,created_by_user_id)
       VALUES ($1,'resume',$2,$3,$4,$5,$6,'ready','portable-context',$7::jsonb,$8)`,
      [
        first.workspaceId,
        portableDocumentId,
        portableDocument.currentVersion.id,
        postingRevision.rows[0]!.id,
        requirementSet.rows[0]!.id,
        matchRun.rows[0]!.id,
        JSON.stringify({ schemaVersion: 1 }),
        first.userId,
      ],
    );
    const otherPosting = await runtimePool.query<{ id: string }>(
      `INSERT INTO job_postings (workspace_id,title)
       VALUES ($1,'Other synthetic context') RETURNING id`,
      [first.workspaceId],
    );
    const otherRevision = await runtimePool.query<{ id: string }>(
      `INSERT INTO job_posting_revisions
         (workspace_id,job_posting_id,input_method,revision_number,normalized_text,
          content_hash,created_by_user_id)
       VALUES ($1,$2,'text',1,'Other synthetic context',$3,$4) RETURNING id`,
      [
        first.workspaceId,
        otherPosting.rows[0]!.id,
        sha256("Other synthetic context"),
        first.userId,
      ],
    );
    const unauthorizedBypass = await runtimePool.connect();
    try {
      await unauthorizedBypass.query("BEGIN");
      await unauthorizedBypass.query(
        "SET LOCAL vitae.workspace_deletion = 'on'",
      );
      await expect(
        unauthorizedBypass.query("DELETE FROM job_requirements WHERE id=$1", [
          requirement.rows[0]!.id,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
      await unauthorizedBypass.query("ROLLBACK");
    } finally {
      unauthorizedBypass.release();
    }

    const portability = new PortabilityService(runtimePool, store);
    const archiveBytes = await portability.exportArchive(first, {
      includeSources: true,
      includeArtifacts: false,
    });
    expect(archiveBytes.toString("utf8")).not.toContain("never-export-this");
    expect(archiveBytes.toString("utf8")).not.toContain(
      "credential_ciphertext",
    );
    const archive = portability.parse(archiveBytes);
    const crossedContext = structuredClone(archive);
    crossedContext.tables.tailoring_runs![0]!.job_posting_revision_id =
      otherRevision.rows[0]!.id;
    expect(validateArchiveSemantics(crossedContext)).toContain(
      "tailoring-run-context",
    );

    const poisoned = structuredClone(archive);
    poisoned.blobs = poisoned.blobs.filter((blob) => blob.kind !== "source");
    poisoned.tables.source_documents![0]!.id = "not-a-uuid/poison";
    poisoned.tables.source_documents![0]!.storage_key = `${first.workspaceId}/not-a-uuid/poison.bin`;
    expect(validateArchiveSemantics(poisoned)).toContain("archive-identifier");
    const poisonTarget = await principal("portable-poison-target");
    await expect(
      portability.importArchive(poisonTarget, poisoned),
    ).rejects.toBeInstanceOf(PortabilityValidationError);
    expect(
      (
        await runtimePool.query(
          "SELECT id FROM source_documents WHERE workspace_id=$1",
          [poisonTarget.workspaceId],
        )
      ).rowCount,
    ).toBe(0);

    const deletion = new WorkspaceDeletionService(runtimePool, {
      ARTIFACT_STORAGE_ROOT: storageRoot,
      PARSER_QUEUE_ROOT: parserRoot,
      JOB_FETCH_QUEUE_ROOT: fetchRoot,
    });
    const requested = await deletion.request(first);
    await expect(
      runtimePool.query(
        "INSERT INTO skills (workspace_id,canonical_name,display_name) VALUES ($1,'blocked','Blocked')",
        [first.workspaceId],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    const receipt = await deletion.process(requested.operationId);
    expect(receipt.state).toBe("succeeded");
    expect(receipt.deletedCounts).toMatchObject({
      job_requirement_sets: 1,
      job_requirements: 1,
    });
    expect(
      receipt.backupExpiresAt.getTime() - receipt.requestedAt.getTime(),
    ).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000);
    expect(
      await runtimePool.query("SELECT 1 FROM workspaces WHERE id=$1", [
        first.workspaceId,
      ]),
    ).toHaveProperty("rowCount", 0);

    const raceTarget = await principal("portable-race-target");
    const gatedStore = new GatedArtifactStore(storageRoot);
    const racedImport = new PortabilityService(
      runtimePool,
      gatedStore,
    ).importArchive(raceTarget, archive);
    await gatedStore.started;
    await runtimePool.query(
      `INSERT INTO skills (workspace_id,canonical_name,display_name)
       VALUES ($1,'concurrent-target-write','Concurrent target write')`,
      [raceTarget.workspaceId],
    );
    gatedStore.release();
    await expect(racedImport).rejects.toThrow("target workspace is not empty");
    await expect(
      gatedStore.read(sourceStorageKey(raceTarget.workspaceId, sourceId)),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const second = await principal("portable-second");
    const preview = await portability.preview(second, archive);
    expect(preview).toMatchObject({ canApply: true, secretFieldCount: 0 });
    await portability.importArchive(second, archive);
    const imported = await runtimePool.query<{ title: string }>(
      "SELECT title FROM career_entries WHERE workspace_id=$1",
      [second.workspaceId],
    );
    expect(imported.rows.map((row) => row.title)).toContain(
      "Synthetic portable project",
    );
    const provider = await runtimePool.query<{
      auth_type: string;
      credential_ciphertext: string | null;
    }>(
      "SELECT auth_type,credential_ciphertext FROM model_provider_configurations WHERE workspace_id=$1",
      [second.workspaceId],
    );
    expect(provider.rows[0]).toEqual({
      auth_type: "none",
      credential_ciphertext: null,
    });
    await expect(
      access(
        path.join(storageRoot, sourceStorageKey(second.workspaceId, sourceId)),
      ),
    ).resolves.toBeUndefined();
  }, 30_000);

  it("blocks final export when an imported version has no claim coverage", async () => {
    const source = await principal("portability-grounding-source");
    const store = new FilesystemArtifactStore(storageRoot);
    const documents = new DocumentRepository(runtimePool);
    const documentId = await documents.create(source, {
      kind: "resume",
      title: "Imported grounding fixture",
    });
    const initial = await documents.get(source, documentId);
    const content = structuredClone(initial.currentVersion.content);
    const claimText = "Earned a PhD from MIT.";
    content.sections[1]!.blocks[0]!.text = claimText;
    await documents.commitVersion(source, {
      documentId,
      baseVersionId: initial.currentVersion.id,
      content,
    });
    const claim = (await documents.listClaims(source, documentId)).find(
      (item) => item.text === claimText,
    )!;
    const entry = await runtimePool.query<{ id: string }>(
      `INSERT INTO career_entries (workspace_id,career_profile_id,type,title)
       SELECT workspace_id,id,'education','Grounding fixture' FROM career_profiles
       WHERE workspace_id=$1 RETURNING id`,
      [source.workspaceId],
    );
    const fact = await runtimePool.query<{ id: string }>(
      `INSERT INTO evidence_facts
         (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
       VALUES ($1,$2,'statement',$3::jsonb,$4,$5::jsonb,$6) RETURNING id`,
      [
        source.workspaceId,
        entry.rows[0]!.id,
        JSON.stringify({ kind: "text", text: claimText }),
        claimText,
        JSON.stringify({ kind: "manual", label: "Grounding fixture" }),
        source.userId,
      ],
    );
    const supportedVersionId = await documents.supportClaimWithEvidence(
      source,
      {
        documentId,
        claimId: claim.id,
        evidenceFactId: fact.rows[0]!.id,
      },
    );
    const exports = new ExportService(runtimePool, store);
    const originalArtifact = await exports.generate(source, {
      documentId,
      versionId: supportedVersionId,
      format: "pdf",
    });

    const portability = new PortabilityService(runtimePool, store);
    const archiveBytes = await portability.exportArchive(source, {
      includeSources: false,
      includeArtifacts: true,
    });
    const rawArchive = portabilityArchiveSchema.parse(
      JSON.parse(archiveBytes.toString("utf8")),
    );
    expect(validateArchiveSemantics(rawArchive)).toEqual([]);

    const staleAnchor = structuredClone(rawArchive);
    const supportedClaim = staleAnchor.tables.generated_claims!.find(
      (row) => row.status === "supported",
    )!;
    supportedClaim.text_hash = `sha256:${"0".repeat(64)}`;
    expect(validateArchiveSemantics(staleAnchor)).toContain(
      "document-claim-structure",
    );

    const unrelatedEvidence = structuredClone(rawArchive);
    unrelatedEvidence.tables.evidence_facts![0]!.display_text =
      "Unrelated approved assertion";
    expect(validateArchiveSemantics(unrelatedEvidence)).toContain(
      "artifact-grounding-hash",
    );

    const withdrawnLifecycle = structuredClone(rawArchive);
    withdrawnLifecycle.options.artifacts = false;
    withdrawnLifecycle.tables.export_artifacts = [];
    withdrawnLifecycle.blobs = withdrawnLifecycle.blobs.filter(
      (blob) => blob.kind !== "export",
    );
    withdrawnLifecycle.tables.evidence_facts![0]!.status = "withdrawn";
    withdrawnLifecycle.tables.career_entries![0]!.status = "archived";
    expect(validateArchiveSemantics(withdrawnLifecycle)).toEqual([]);

    const mismatchedContent = structuredClone(rawArchive);
    mismatchedContent.tables.document_versions!.at(-1)!.content_hash =
      `sha256:${"f".repeat(64)}`;
    expect(validateArchiveSemantics(mismatchedContent)).toContain(
      "document-version-integrity",
    );

    const archive = portability.parse(archiveBytes);
    archive.tables.generated_claims = [];
    archive.tables.claim_evidence = [];
    expect(validateArchiveSemantics(archive)).toContain(
      "document-claim-structure",
    );

    const deletion = new WorkspaceDeletionService(runtimePool, {
      ARTIFACT_STORAGE_ROOT: storageRoot,
      PARSER_QUEUE_ROOT: parserRoot,
      JOB_FETCH_QUEUE_ROOT: fetchRoot,
    });
    const operation = await deletion.request(source);
    expect((await deletion.process(operation.operationId)).state).toBe(
      "succeeded",
    );

    const target = await principal("portability-grounding-target");
    const preview = await portability.preview(target, archive);
    expect(preview).toMatchObject({
      canApply: false,
      reasons: [
        "The archive contains invalid document or artifact provenance.",
      ],
    });
    await expect(
      portability.importArchive(target, archive),
    ).rejects.toBeInstanceOf(PortabilityValidationError);
    expect(
      Number(
        (
          await runtimePool.query<{ count: string }>(
            "SELECT count(*)::text count FROM documents WHERE workspace_id=$1",
            [target.workspaceId],
          )
        ).rows[0]!.count,
      ),
    ).toBe(0);
    expect(
      Number(
        (
          await runtimePool.query<{ count: string }>(
            "SELECT count(*)::text count FROM export_artifacts WHERE workspace_id=$1",
            [target.workspaceId],
          )
        ).rows[0]!.count,
      ),
    ).toBe(0);
    await expect(
      store.read(
        exportArtifactStorageKey(target.workspaceId, originalArtifact.id),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
