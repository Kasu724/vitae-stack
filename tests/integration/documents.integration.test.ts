// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Pool } from "@/infrastructure/database/sqlite-pool";
import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../helpers/sqlite-test-database";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { JobRepository } from "@/modules/jobs/repository";
import {
  DocumentConflictError,
  DocumentDependencyError,
  DocumentNotFoundError,
  DocumentRepository,
} from "@/modules/documents/repository";

let testDatabase: SqliteTestDatabase;
let runtimePool: Pool;
let repository: DocumentRepository;
let first: WorkspacePrincipal;
let second: WorkspacePrincipal;

async function principal(label: string): Promise<WorkspacePrincipal> {
  const user = await runtimePool.query<{ id: string }>(
    "INSERT INTO users (email,name) VALUES ($1,$2) RETURNING id",
    [`${label}@example.test`, label],
  );
  const userId = user.rows[0]!.id;
  const workspace = await runtimePool.query<{ id: string }>(
    "INSERT INTO workspaces (owner_user_id,name) VALUES ($1,$2) RETURNING id",
    [userId, `${label} workspace`],
  );
  const workspaceId = workspace.rows[0]!.id;
  await runtimePool.query(
    "INSERT INTO workspace_memberships (workspace_id,user_id) VALUES ($1,$2)",
    [workspaceId, userId],
  );
  await runtimePool.query(
    "INSERT INTO career_profiles (workspace_id,display_name) VALUES ($1,$2)",
    [workspaceId, label],
  );
  return {
    authenticatedAt: new Date(),
    mode: "trusted-local",
    userId,
    workspaceId,
  };
}

beforeAll(async () => {
  testDatabase = await createSqliteTestDatabase("documents");
  runtimePool = testDatabase.pool;
  repository = new DocumentRepository(runtimePool);
  first = await principal("document-first");
  second = await principal("document-second");
}, 120_000);

afterAll(async () => {
  await testDatabase?.cleanup();
});

describe("document library and versioning", () => {
  it("creates an immutable initial version and isolates it by workspace", async () => {
    const id = await repository.create(first, {
      kind: "resume",
      title: "Synthetic resume",
    });
    const record = await repository.get(first, id);
    expect(record.currentVersion).toMatchObject({
      reason: "initial",
      parent_version_id: null,
    });
    expect(record.currentVersion.content_hash).toMatch(
      /^sha256:[0-9a-f]{64}$/u,
    );
    await expect(repository.get(second, id)).rejects.toBeInstanceOf(
      DocumentNotFoundError,
    );
    await expect(
      runtimePool.query(
        "UPDATE document_versions SET content='{}'::jsonb WHERE id=$1",
        [record.currentVersion.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("uses optimistic draft revisions and commits one parent-linked version idempotently", async () => {
    const id = await repository.create(first, {
      kind: "cover_letter",
      title: "Synthetic letter",
    });
    const initial = await repository.get(first, id);
    const edited = structuredClone(initial.currentVersion.content);
    edited.sections[2]!.blocks[0]!.text = "Synthetic body";
    const draft = await repository.saveDraft(first, {
      documentId: id,
      baseVersionId: initial.currentVersion.id,
      expectedRevision: 0,
      content: edited,
    });
    expect(draft.revision).toBe(1);
    await expect(
      repository.saveDraft(first, {
        documentId: id,
        baseVersionId: initial.currentVersion.id,
        expectedRevision: 0,
        content: edited,
      }),
    ).rejects.toBeInstanceOf(DocumentConflictError);

    const versionId = await repository.commitVersion(first, {
      documentId: id,
      baseVersionId: initial.currentVersion.id,
      content: edited,
      idempotencyKey: "synthetic-review-commit",
    });
    const retryId = await repository.commitVersion(first, {
      documentId: id,
      baseVersionId: initial.currentVersion.id,
      content: edited,
      idempotencyKey: "synthetic-review-commit",
    });
    expect(retryId).toBe(versionId);
    const current = await repository.get(first, id);
    expect(current.currentVersion).toMatchObject({
      id: versionId,
      parent_version_id: initial.currentVersion.id,
    });
    expect(current.draft).toBeNull();
    expect(current.versions).toHaveLength(2);
    expect(
      await repository.compare(first, id, initial.currentVersion.id, versionId),
    ).toMatchObject({ changedBlocks: [edited.sections[2]!.blocks[0]!.id] });
  });

  it("restores by copying forward without rewriting historical content", async () => {
    const id = await repository.create(first, {
      kind: "resume",
      title: "Restore fixture",
    });
    const initial = await repository.get(first, id);
    const edited = structuredClone(initial.currentVersion.content);
    edited.sections[1]!.blocks[0]!.text = "Changed summary";
    const changedId = await repository.commitVersion(first, {
      documentId: id,
      baseVersionId: initial.currentVersion.id,
      content: edited,
    });
    const restoredId = await repository.restore(
      first,
      id,
      initial.currentVersion.id,
      changedId,
    );
    const restored = await repository.get(first, id);
    expect(restored.currentVersion).toMatchObject({
      id: restoredId,
      parent_version_id: changedId,
      restored_from_version_id: initial.currentVersion.id,
      reason: "restore",
      content_hash: initial.currentVersion.content_hash,
    });
    expect(restored.versions).toHaveLength(3);
  });

  it("can represent unsupported claims without evidence and enforces cross-workspace evidence ownership", async () => {
    const id = await repository.create(first, {
      kind: "resume",
      title: "Claim fixture",
    });
    const record = await repository.get(first, id);
    const block = record.currentVersion.content.sections[1]!.blocks[0]!;
    const claim = await runtimePool.query<{ id: string }>(
      `INSERT INTO generated_claims (workspace_id,version_id,stable_block_id,start_offset,end_offset,text_hash,status) VALUES ($1,$2,$3,0,1,'sha256:synthetic','unverified') RETURNING id`,
      [first.workspaceId, record.currentVersion.id, block.id],
    );
    expect(claim.rows[0]?.id).toBeTruthy();
    const otherFact = await runtimePool.query<{ id: string }>(
      `INSERT INTO career_entries (workspace_id,career_profile_id,type,title) SELECT workspace_id,id,'custom','Other' FROM career_profiles WHERE workspace_id=$1 RETURNING id`,
      [second.workspaceId],
    );
    const fact = await runtimePool.query<{ id: string }>(
      `INSERT INTO evidence_facts (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id) VALUES ($1,$2,'statement','{"kind":"text","text":"other"}','other','{"kind":"manual","label":"Manual"}',$3) RETURNING id`,
      [second.workspaceId, otherFact.rows[0]!.id, second.userId],
    );
    await expect(
      runtimePool.query(
        "INSERT INTO claim_evidence (workspace_id,claim_id,evidence_fact_id) VALUES ($1,$2,$3)",
        [first.workspaceId, claim.rows[0]!.id, fact.rows[0]!.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("tracks new manual text conservatively and permits explicit nonfactual classification", async () => {
    const id = await repository.create(first, {
      kind: "cover_letter",
      title: "Manual classification fixture",
    });
    const initial = await repository.get(first, id);
    const content = structuredClone(initial.currentVersion.content);
    content.sections.find(
      (section) => section.type === "salutation",
    )!.blocks[0]!.text = "Dear hiring team,";
    await repository.commitVersion(first, {
      documentId: id,
      baseVersionId: initial.currentVersion.id,
      content,
    });
    const manualClaim = (await repository.listClaims(first, id))[0]!;
    expect(manualClaim).toMatchObject({
      text: "Dear hiring team,",
      status: "unverified",
    });
    await repository.markClaimNonfactual(first, {
      documentId: id,
      claimId: manualClaim.id,
    });
    expect(await repository.listClaims(first, id)).toMatchObject([
      { text: "Dear hiring team,", status: "nonfactual", evidence: [] },
    ]);
    await expect(
      repository.markClaimNonfactual(second, {
        documentId: id,
        claimId: manualClaim.id,
      }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  it("refuses to support an unrelated clause through partial lexical overlap", async () => {
    const documentId = await repository.create(first, {
      kind: "resume",
      title: "Grounding boundary fixture",
    });
    const initial = await repository.get(first, documentId);
    const content = structuredClone(initial.currentVersion.content);
    const block = content.sections[1]!.blocks[0]!;
    block.text = "Built secure systems for clients and earned a PhD from MIT.";
    await repository.commitVersion(first, {
      documentId,
      baseVersionId: initial.currentVersion.id,
      content,
    });
    const claim = (await repository.listClaims(first, documentId)).find(
      (item) => item.text === block.text,
    )!;
    const entry = await runtimePool.query<{ id: string }>(
      `INSERT INTO career_entries (workspace_id,career_profile_id,type,title)
       SELECT workspace_id,id,'custom','Grounding evidence' FROM career_profiles
       WHERE workspace_id=$1 RETURNING id`,
      [first.workspaceId],
    );
    const evidenceText = "Built secure systems for clients";
    const fact = await runtimePool.query<{ id: string }>(
      `INSERT INTO evidence_facts
         (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
       VALUES ($1,$2,'statement',$3::jsonb,$4,$5::jsonb,$6) RETURNING id`,
      [
        first.workspaceId,
        entry.rows[0]!.id,
        JSON.stringify({ kind: "text", text: evidenceText }),
        evidenceText,
        JSON.stringify({ kind: "manual", label: "Grounding fixture" }),
        first.userId,
      ],
    );

    await expect(
      repository.supportClaimWithEvidence(first, {
        documentId,
        claimId: claim.id,
        evidenceFactId: fact.rows[0]!.id,
      }),
    ).rejects.toBeInstanceOf(DocumentConflictError);
  });

  it("preserves unchanged provenance and invalidates a manually changed factual span", async () => {
    const id = await repository.create(first, {
      kind: "resume",
      title: "Provenance fixture",
    });
    const initial = await repository.get(first, id);
    const supportedContent = structuredClone(initial.currentVersion.content);
    const block = supportedContent.sections[1]!.blocks[0]!;
    block.text = "Supported synthetic claim";
    let supportedVersionId = await repository.commitVersion(first, {
      documentId: id,
      baseVersionId: initial.currentVersion.id,
      content: supportedContent,
    });
    const entry = await runtimePool.query<{ id: string }>(
      `INSERT INTO career_entries (workspace_id,career_profile_id,type,title)
       SELECT workspace_id,id,'custom','Evidence fixture' FROM career_profiles WHERE workspace_id=$1 RETURNING id`,
      [first.workspaceId],
    );
    const fact = await runtimePool.query<{ id: string }>(
      `INSERT INTO evidence_facts (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
       VALUES ($1,$2,'statement','{"kind":"text","text":"Supported synthetic claim"}','Supported synthetic claim','{"kind":"manual","label":"Manual"}',$3) RETURNING id`,
      [first.workspaceId, entry.rows[0]!.id, first.userId],
    );
    const claim = (await repository.listClaims(first, id)).find(
      (item) => item.text === block.text,
    )!;
    supportedVersionId = await repository.supportClaimWithEvidence(first, {
      documentId: id,
      claimId: claim.id,
      evidenceFactId: fact.rows[0]!.id,
    });

    const unchangedVersionId = await repository.commitVersion(first, {
      documentId: id,
      baseVersionId: supportedVersionId,
      content: supportedContent,
    });
    const unchangedClaim = await runtimePool.query<{ id: string }>(
      `SELECT id FROM generated_claims WHERE version_id=$1 AND workspace_id=$2 AND status='supported'`,
      [unchangedVersionId, first.workspaceId],
    );
    expect(unchangedClaim.rowCount).toBe(1);
    const unchangedEvidence = await runtimePool.query(
      `SELECT 1 FROM claim_evidence WHERE claim_id=$1 AND evidence_fact_id=$2`,
      [unchangedClaim.rows[0]!.id, fact.rows[0]!.id],
    );
    expect(unchangedEvidence.rowCount).toBe(1);

    const changedContent = structuredClone(supportedContent);
    changedContent.sections[1]!.blocks[0]!.text = "Unsupported manual rewrite";
    const changedVersionId = await repository.commitVersion(first, {
      documentId: id,
      baseVersionId: unchangedVersionId,
      content: changedContent,
    });
    const changedClaim = await runtimePool.query<{
      id: string;
      status: string;
    }>(
      `SELECT id,status FROM generated_claims WHERE version_id=$1 AND workspace_id=$2`,
      [changedVersionId, first.workspaceId],
    );
    expect(changedClaim.rows[0]?.status).toBe("unverified");
    expect(
      await runtimePool.query(
        `SELECT 1 FROM claim_evidence WHERE claim_id=$1`,
        [changedClaim.rows[0]!.id],
      ),
    ).toHaveProperty("rowCount", 0);
    const diff = await repository.compare(
      first,
      id,
      unchangedVersionId,
      changedVersionId,
    );
    expect(diff.changedClaims).toHaveLength(1);
    expect(diff.provenanceChanges).toHaveLength(1);
  });

  it("previews and atomically deletes a complete document history and export metadata", async () => {
    const documentId = await repository.create(first, {
      kind: "resume",
      title: "Disposable generated document",
    });
    const initial = await repository.get(first, documentId);
    const content = structuredClone(initial.currentVersion.content);
    content.sections[1]!.blocks[0]!.text = "Disposable generated claim";
    const currentVersionId = await repository.commitVersion(first, {
      documentId,
      baseVersionId: initial.currentVersion.id,
      content,
    });
    await repository.saveDraft(first, {
      documentId,
      baseVersionId: currentVersionId,
      expectedRevision: 0,
      content,
    });
    await repository.setLock(first, {
      documentId,
      targetType: "block",
      targetId: content.sections[1]!.blocks[0]!.id,
      locked: true,
    });
    const jobs = new JobRepository(runtimePool);
    const jobId = await jobs.createFromText(first, {
      title: "Document deletion fixture job",
      company: "Example Company",
      text: "Review generated document deletion",
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
       VALUES ($1,$2,1,'synthetic@1',$3,0,$4) RETURNING id`,
      [
        first.workspaceId,
        requirementSet.rows[0]!.id,
        `sha256:${"f".repeat(64)}`,
        first.userId,
      ],
    );
    const tailoringRun = await runtimePool.query<{ id: string }>(
      `INSERT INTO tailoring_runs
         (workspace_id,kind,document_id,base_version_id,job_posting_revision_id,
          requirement_set_id,match_run_id,status,idempotency_key,manifest,created_by_user_id)
       VALUES ($1,'resume',$2,$3,$4,$5,$6,'ready',$7,'{}',$8) RETURNING id`,
      [
        first.workspaceId,
        documentId,
        currentVersionId,
        jobRevision.id,
        requirementSet.rows[0]!.id,
        matchRun.rows[0]!.id,
        crypto.randomUUID(),
        first.userId,
      ],
    );
    await runtimePool.query(
      `INSERT INTO ats_reports
         (workspace_id,document_version_id,ruleset_version,document_hash,input_hash,
          evaluated_weight,overall_score_basis_points,blocker_count)
       VALUES ($1,$2,'synthetic@1',$3,$4,100,7500,0)`,
      [
        first.workspaceId,
        currentVersionId,
        (await repository.get(first, documentId)).currentVersion.content_hash,
        `sha256:${"a".repeat(64)}`,
      ],
    );
    const artifactId = crypto.randomUUID();
    const storageKey = `${first.workspaceId}/${artifactId}.bin`;
    await runtimePool.query(
      `INSERT INTO export_artifacts
         (id,workspace_id,document_version_id,requested_by_user_id,format,classification,
          media_type,filename,storage_key,byte_size,content_hash,input_hash,manifest,expires_at)
       VALUES ($1,$2,$3,$4,'pdf','final','application/pdf','synthetic.pdf',$5,4,$6,$7,'{}',date_add(now(),86400000))`,
      [
        artifactId,
        first.workspaceId,
        currentVersionId,
        first.userId,
        storageKey,
        `sha256:${"b".repeat(64)}`,
        `sha256:${"c".repeat(64)}`,
      ],
    );
    const foreignDocumentId = await repository.create(second, {
      kind: "resume",
      title: "Foreign generated document",
    });
    let stagedKeys: string[] | null = null;
    let committed = 0;
    let rolledBack = 0;
    const stage = async (keys: string[]) => {
      stagedKeys = keys;
      return {
        commit: async () => {
          committed += 1;
        },
        rollback: async () => {
          rolledBack += 1;
        },
      };
    };

    expect(await repository.dependencyPreview(first, documentId)).toMatchObject(
      {
        versions: 2,
        claims: 1,
        drafts: 1,
        locks: 1,
        tailoringRuns: 1,
        atsReports: 1,
        exportArtifacts: 1,
        artifactBytes: 4,
        externalReferences: 0,
      },
    );
    await expect(
      repository.deleteManyWithArtifacts(
        first,
        [documentId, foreignDocumentId],
        stage,
      ),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(stagedKeys).toBeNull();
    await expect(repository.get(first, documentId)).resolves.toBeDefined();

    await repository.deleteManyWithArtifacts(first, [documentId], stage);
    expect(stagedKeys).toEqual([storageKey]);
    expect(committed).toBe(1);
    expect(rolledBack).toBe(0);
    await expect(repository.get(first, documentId)).rejects.toBeInstanceOf(
      DocumentNotFoundError,
    );
    expect(
      await runtimePool.query(
        "SELECT id FROM export_artifacts WHERE id=$1 UNION ALL SELECT id FROM ats_reports WHERE document_version_id=$2",
        [artifactId, currentVersionId],
      ),
    ).toMatchObject({ rowCount: 0 });
    expect(
      await runtimePool.query("SELECT id FROM tailoring_runs WHERE id=$1", [
        tailoringRun.rows[0]!.id,
      ]),
    ).toMatchObject({ rowCount: 0 });
  });

  it("blocks deletion instead of severing cross-document claim history", async () => {
    const sourceDocumentId = await repository.create(first, {
      kind: "resume",
      title: "Externally referenced source document",
    });
    const dependentDocumentId = await repository.create(first, {
      kind: "resume",
      title: "External claim dependent document",
    });
    const source = await repository.get(first, sourceDocumentId);
    const dependent = await repository.get(first, dependentDocumentId);
    const sourceClaim = await runtimePool.query<{ id: string }>(
      `INSERT INTO generated_claims
         (workspace_id,version_id,stable_block_id,start_offset,end_offset,text_hash,status)
       VALUES ($1,$2,'source-block',0,1,$3,'unverified') RETURNING id`,
      [first.workspaceId, source.currentVersion.id, `sha256:${"d".repeat(64)}`],
    );
    await runtimePool.query(
      `INSERT INTO generated_claims
         (workspace_id,version_id,stable_block_id,start_offset,end_offset,text_hash,status,source_claim_id)
       VALUES ($1,$2,'dependent-block',0,1,$3,'unverified',$4)`,
      [
        first.workspaceId,
        dependent.currentVersion.id,
        `sha256:${"e".repeat(64)}`,
        sourceClaim.rows[0]!.id,
      ],
    );

    expect(
      await repository.dependencyPreview(first, sourceDocumentId),
    ).toMatchObject({ externalReferences: 1 });
    let staged = false;
    await expect(
      repository.deleteManyWithArtifacts(
        first,
        [sourceDocumentId],
        async () => {
          staged = true;
          return {
            commit: async () => undefined,
            rollback: async () => undefined,
          };
        },
      ),
    ).rejects.toBeInstanceOf(DocumentDependencyError);
    expect(staged).toBe(false);
    await expect(
      repository.get(first, sourceDocumentId),
    ).resolves.toBeDefined();
  });
});
