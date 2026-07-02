// @vitest-environment node

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseConnection } from "@/infrastructure/database/connection";
import { migrateDatabase } from "@/infrastructure/database/migration";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import {
  DocumentConflictError,
  DocumentRepository,
} from "@/modules/documents/repository";
import { contentHash } from "@/modules/documents/hash";
import { JobRepository } from "@/modules/jobs/repository";
import {
  MatchDecisionConflictError,
  MatchingRepository,
} from "@/modules/matching/repository";
import { RequirementRepository } from "@/modules/requirements/repository";
import { RequirementAnalysisService } from "@/modules/requirements/service";
import {
  TailoringInputConflictError,
  TailoringNotFoundError,
  TailoringRepository,
} from "@/modules/tailoring/repository";

let container: StartedPostgreSqlContainer;
let ownerPool: Pool;
let runtimePool: Pool;
let jobs: JobRepository;
let requirements: RequirementRepository;
let service: RequirementAnalysisService;
let documents: DocumentRepository;
let tailoring: TailoringRepository;
let first: WorkspacePrincipal;
let second: WorkspacePrincipal;

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
    mode: "password",
    userId: user.rows[0]!.id,
    workspaceId: workspace.rows[0]!.id,
  };
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.4-bookworm")
    .withDatabase("vitae_requirements_test")
    .withUsername("postgres")
    .withPassword("synthetic-admin-password")
    .start();
  ownerPool = new Pool({ connectionString: container.getConnectionUri() });
  await ownerPool.query(
    "CREATE ROLE vitae_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD 'synthetic-runtime-password'",
  );
  await ownerPool.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  const migration = createDatabaseConnection(container.getConnectionUri());
  await migrateDatabase(migration.database);
  await migration.pool.end();
  runtimePool = new Pool({
    connectionString: `postgresql://vitae_app:synthetic-runtime-password@${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
  });
  jobs = new JobRepository(runtimePool);
  requirements = new RequirementRepository(runtimePool);
  service = new RequirementAnalysisService(requirements);
  documents = new DocumentRepository(runtimePool);
  tailoring = new TailoringRepository(runtimePool);
  first = await principal("requirements-first");
  second = await principal("requirements-second");
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await ownerPool?.end();
  await container?.stop();
});

describe("reviewed job requirements", () => {
  it("reviews proposals, isolates workspaces, and preserves immutable revisions", async () => {
    const jobId = await jobs.createFromText(first, {
      title: "Synthetic requirement role",
      company: "Example Company",
      text: "Requirements:\n- Build synthetic systems\n- Review deterministic controls",
    });
    const job = await jobs.get(first, jobId);
    const jobRevision = job.revisions[0]!;
    const setId = await service.createDeterministicDraft(
      first,
      jobRevision.id,
      jobRevision.normalized_text,
    );
    const draft = (
      await requirements.listForJobRevision(first, jobRevision.id)
    )[0]!;
    expect(draft.id).toBe(setId);
    expect(draft.requirements).toHaveLength(2);
    expect(
      await requirements.listForJobRevision(second, jobRevision.id),
    ).toEqual([]);

    for (const requirement of draft.requirements)
      await requirements.reviseRequirement(first, {
        setId,
        requirementId: requirement.id,
        category: requirement.category,
        priority: requirement.priority,
        decision: "accepted",
        requirementText: requirement.requirement_text,
      });
    await requirements.finalize(first, setId);
    const reviewed = (
      await requirements.listForJobRevision(first, jobRevision.id)
    )[0]!;
    expect(reviewed.status).toBe("reviewed");
    await expect(
      runtimePool.query(
        "UPDATE job_requirements SET requirement_text='tampered' WHERE id=$1",
        [reviewed.requirements[0]!.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    const correctionId = await requirements.createCorrectionDraft(first, setId);
    const sets = await requirements.listForJobRevision(first, jobRevision.id);
    expect(sets[0]).toMatchObject({
      id: correctionId,
      parent_set_id: setId,
      revision_number: 2,
      status: "draft",
    });
    expect(sets[0]!.requirements).toHaveLength(2);
    expect(sets[1]!.status).toBe("reviewed");
    const audits = await runtimePool.query<{ metadata: unknown }>(
      "SELECT metadata FROM audit_events WHERE target_id=$1",
      [setId],
    );
    expect(JSON.stringify(audits.rows)).not.toContain(
      "Build synthetic systems",
    );

    const entry = await runtimePool.query<{ id: string }>(
      `INSERT INTO career_entries (workspace_id,career_profile_id,type,title,description)
       SELECT $1,id,'project','Synthetic platform','Synthetic evidence fixture' FROM career_profiles WHERE workspace_id=$1 RETURNING id`,
      [first.workspaceId],
    );
    const fact = await runtimePool.query<{ id: string }>(
      `INSERT INTO evidence_facts (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
       VALUES ($1,$2,'statement',$3::jsonb,'Built synthetic systems',$4::jsonb,$5) RETURNING id`,
      [
        first.workspaceId,
        entry.rows[0]!.id,
        JSON.stringify({ kind: "text", text: "Built synthetic systems" }),
        JSON.stringify({ kind: "manual", label: "Synthetic fixture" }),
        first.userId,
      ],
    );
    const matching = new MatchingRepository(runtimePool);
    const runId = await matching.generate(first, setId);
    const matrix = await matching.getLatestMatrix(first, setId);
    expect(matrix?.run.id).toBe(runId);
    const candidate = matrix?.requirements
      .flatMap((requirement) => requirement.candidates)
      .find((item) => item.evidence_fact_id === fact.rows[0]!.id);
    expect(candidate).toMatchObject({
      strength: "direct",
      current_decision: null,
    });
    await matching.decide(first, candidate!.id, "included");
    await matching.decide(first, candidate!.id, "excluded");
    expect(
      (await matching.getLatestMatrix(first, setId))?.requirements
        .flatMap((requirement) => requirement.candidates)
        .find((item) => item.id === candidate!.id),
    ).toMatchObject({ current_decision: "excluded", decision_revision: 2 });
    await expect(
      matching.decide(second, candidate!.id, "included"),
    ).rejects.toBeInstanceOf(MatchDecisionConflictError);
    await runtimePool.query(
      "UPDATE evidence_facts SET status='withdrawn',withdrawn_by_user_id=$3,withdrawn_at=now() WHERE id=$1 AND workspace_id=$2",
      [fact.rows[0]!.id, first.workspaceId, first.userId],
    );
    await expect(
      matching.decide(first, candidate!.id, "included"),
    ).rejects.toBeInstanceOf(MatchDecisionConflictError);
    await expect(
      runtimePool.query(
        "UPDATE requirement_evidence_matches SET reason='tampered' WHERE id=$1",
        [candidate!.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects mismatched source locators before persistence", async () => {
    const jobId = await jobs.createFromText(first, {
      title: "Invalid span role",
      company: "",
      text: "Known requirement",
    });
    const revision = (await jobs.get(first, jobId)).revisions[0]!;
    await expect(
      requirements.createDraft(first, {
        jobRevisionId: revision.id,
        method: "ai",
        metadata: {
          schemaVersion: 1,
          taskVersion: "ai-02.v1",
          warnings: [],
          inputHash: `sha256:${"a".repeat(64)}`,
        },
        proposals: [
          {
            category: "required_qualification",
            priority: "required",
            requirementText: "Unknown",
            sourceStart: 0,
            sourceEnd: 5,
            sourceText: "Wrong",
          },
        ],
      }),
    ).rejects.toThrow("Invalid requirement source span");
  });

  it("pins resume-tailoring inputs, enforces ownership and locks, and preserves claim evidence", async () => {
    const resumeId = await documents.create(first, {
      kind: "resume",
      title: "Grounded tailoring fixture",
    });
    const initial = await documents.get(first, resumeId);
    const content = structuredClone(initial.currentVersion.content);
    const experienceSection = content.sections.find(
      (section) => section.type === "experience",
    )!;
    const experienceBlock = experienceSection.blocks[0]!;
    experienceBlock.text = "Built synthetic systems";
    await documents.commitVersion(first, {
      documentId: resumeId,
      baseVersionId: initial.currentVersion.id,
      content,
    });

    const entry = await runtimePool.query<{ id: string }>(
      `INSERT INTO career_entries (workspace_id,career_profile_id,type,title,description)
       SELECT $1,id,'project','Grounded project','Synthetic tailoring evidence' FROM career_profiles WHERE workspace_id=$1 RETURNING id`,
      [first.workspaceId],
    );
    const fact = await runtimePool.query<{ id: string }>(
      `INSERT INTO evidence_facts (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
       VALUES ($1,$2,'statement',$3::jsonb,'Built synthetic systems',$4::jsonb,$5) RETURNING id`,
      [
        first.workspaceId,
        entry.rows[0]!.id,
        JSON.stringify({ kind: "text", text: "Built synthetic systems" }),
        JSON.stringify({ kind: "manual", label: "Synthetic fixture" }),
        first.userId,
      ],
    );
    const jobId = await jobs.createFromText(first, {
      title: "Grounded role",
      company: "Example Company",
      text: "Requirements:\n- Build synthetic systems",
    });
    const jobRevision = (await jobs.get(first, jobId)).revisions[0]!;
    const setId = await service.createDeterministicDraft(
      first,
      jobRevision.id,
      jobRevision.normalized_text,
    );
    const draft = (
      await requirements.listForJobRevision(first, jobRevision.id)
    )[0]!;
    for (const requirement of draft.requirements)
      await requirements.reviseRequirement(first, {
        setId,
        requirementId: requirement.id,
        category: requirement.category,
        priority: requirement.priority,
        decision: "accepted",
        requirementText: requirement.requirement_text,
      });
    await requirements.finalize(first, setId);
    const matching = new MatchingRepository(runtimePool);
    await matching.generate(first, setId);
    const matrix = (await matching.getLatestMatrix(first, setId))!;
    const matchedRequirement = matrix.requirements.find((requirement) =>
      requirement.candidates.some(
        (item) => item.evidence_fact_id === fact.rows[0]!.id,
      ),
    )!;
    const candidate = matchedRequirement.candidates.find(
      (item) => item.evidence_fact_id === fact.rows[0]!.id,
    )!;
    expect(candidate.strength).toMatch(/direct|combined/u);
    await matching.decide(first, candidate.id, "included");

    const provider = await runtimePool.query<{ id: string }>(
      `INSERT INTO model_provider_configurations (workspace_id,created_by_user_id,kind,label,base_url,auth_type,capabilities,task_assignments,status,last_tested_at)
       VALUES ($1,$2,'openai_compatible','Synthetic tailoring provider','https://provider.example.test/v1','none',$3::jsonb,$4::jsonb,'available',now()) RETURNING id`,
      [
        first.workspaceId,
        first.userId,
        JSON.stringify({
          schemaVersion: 1,
          structuredOutput: true,
          usage: true,
          refusal: true,
          warnings: [],
        }),
        JSON.stringify({
          "AI-05": "synthetic",
          "AI-06": "synthetic",
          "AI-07": "synthetic",
          "AI-08": "synthetic",
        }),
      ],
    );
    const prepare = (idempotencyKey: string) =>
      tailoring.prepareResumeRun(first, {
        documentId: resumeId,
        jobId,
        selectedEntryIds: [entry.rows[0]!.id],
        providerConfigurationId: provider.rows[0]!.id,
        tone: "direct",
        targetLength: "standard",
        idempotencyKey,
      });
    const prepared = await prepare("tailoring-success");
    expect(prepared).toMatchObject({
      existing: false,
      evidence: [expect.objectContaining({ id: fact.rows[0]!.id })],
    });
    const proposed = "Built synthetic systems with approved evidence";
    await tailoring.completeResumeRun(first, prepared.runId, {
      taskResults: [],
      gaps: [],
      suggestions: [
        {
          operation: "replace_block_text",
          targetSectionId: experienceSection.id,
          targetBlockId: experienceBlock.id,
          baseBlockHash: contentHash(experienceBlock),
          beforeText: experienceBlock.text,
          afterText: proposed,
          rationale: "Uses only the selected approved evidence.",
          taskId: "AI-06",
          taskVersion: "ai-06.v1",
          requirementIds: [matchedRequirement.id],
          claims: [
            {
              start: 0,
              end: proposed.length,
              relation: "direct",
              evidenceFactIds: [fact.rows[0]!.id],
            },
          ],
        },
      ],
    });
    const view = await tailoring.getRun(first, prepared.runId);
    expect(view.run.status).toBe("ready");
    expect(view.suggestions[0]!.claims[0]!.evidence[0]).toMatchObject({
      id: fact.rows[0]!.id,
      entryId: entry.rows[0]!.id,
      status: "approved",
    });
    const letterId = await documents.create(first, {
      kind: "cover_letter",
      title: "Grounded cover-letter fixture",
    });
    const letter = await documents.get(first, letterId);
    const bodySection = letter.currentVersion.content.sections.find(
      (section) => section.type === "body",
    )!;
    const bodyBlock = bodySection.blocks[0]!;
    const letterRun = await tailoring.prepareCoverLetterRun(first, {
      documentId: letterId,
      jobId,
      selectedEntryIds: [entry.rows[0]!.id],
      providerConfigurationId: provider.rows[0]!.id,
      tone: "formal",
      targetLength: "concise",
      idempotencyKey: "tailoring-cover-letter",
    });
    await tailoring.completeResumeRun(first, letterRun.runId, {
      taskResults: [],
      gaps: [],
      suggestions: [
        {
          operation: "replace_block_text",
          targetSectionId: bodySection.id,
          targetBlockId: bodyBlock.id,
          baseBlockHash: contentHash(bodyBlock),
          beforeText: bodyBlock.text,
          afterText: proposed,
          rationale: "Uses selected career evidence only.",
          taskId: "AI-08",
          taskVersion: "ai-08.v1",
          requirementIds: [matchedRequirement.id],
          claims: [
            {
              start: 0,
              end: proposed.length,
              relation: "direct",
              evidenceFactIds: [fact.rows[0]!.id],
            },
          ],
        },
      ],
    });
    const letterView = await tailoring.getRun(first, letterRun.runId);
    expect(letterView).toMatchObject({
      run: { kind: "cover_letter", status: "ready" },
    });
    const acceptedVersionId = await tailoring.reviewRun(
      first,
      letterRun.runId,
      [
        {
          suggestionId: letterView.suggestions[0]!.id,
          decision: "accepted",
          editedText: proposed,
        },
      ],
    );
    expect(acceptedVersionId).toBeTruthy();
    expect(await tailoring.reviewRun(first, letterRun.runId, [])).toBe(
      acceptedVersionId,
    );
    const supportedClaim = await runtimePool.query<{
      status: string;
      evidence_fact_id: string;
    }>(
      `SELECT c.status,ce.evidence_fact_id FROM generated_claims c JOIN claim_evidence ce ON ce.claim_id=c.id AND ce.workspace_id=c.workspace_id WHERE c.version_id=$1`,
      [acceptedVersionId],
    );
    expect(supportedClaim.rows[0]).toMatchObject({
      status: "supported",
      evidence_fact_id: fact.rows[0]!.id,
    });

    const acceptedLetter = await documents.get(first, letterId);
    const acceptedBody = acceptedLetter.currentVersion.content.sections.find(
      (section) => section.type === "body",
    )!.blocks[0]!;
    const editedRun = await tailoring.prepareCoverLetterRun(first, {
      documentId: letterId,
      jobId,
      selectedEntryIds: [entry.rows[0]!.id],
      providerConfigurationId: provider.rows[0]!.id,
      tone: "formal",
      targetLength: "concise",
      idempotencyKey: "tailoring-manual-edit",
    });
    await tailoring.completeResumeRun(first, editedRun.runId, {
      taskResults: [],
      gaps: [],
      suggestions: [
        {
          operation: "replace_block_text",
          targetSectionId: bodySection.id,
          targetBlockId: acceptedBody.id,
          baseBlockHash: contentHash(acceptedBody),
          beforeText: acceptedBody.text,
          afterText: "Built synthetic systems",
          rationale: "Grounded replacement before the user edit.",
          taskId: "AI-08",
          taskVersion: "ai-08.v1",
          requirementIds: [matchedRequirement.id],
          claims: [
            {
              start: 0,
              end: "Built synthetic systems".length,
              relation: "direct",
              evidenceFactIds: [fact.rows[0]!.id],
            },
          ],
        },
      ],
    });
    const editedView = await tailoring.getRun(first, editedRun.runId);
    const manualText = "User-authored assertion requiring verification";
    const editedVersionId = await tailoring.reviewRun(first, editedRun.runId, [
      {
        suggestionId: editedView.suggestions[0]!.id,
        decision: "accepted",
        editedText: manualText,
      },
    ]);
    const unverifiedClaim = await runtimePool.query<{
      id: string;
      status: string;
    }>(
      `SELECT id,status FROM generated_claims WHERE version_id=$1 AND stable_block_id=$2`,
      [editedVersionId, acceptedBody.id],
    );
    expect(unverifiedClaim).toMatchObject({
      rows: [{ status: "unverified" }],
    });
    expect(
      await runtimePool.query(
        `SELECT 1 FROM claim_evidence ce JOIN generated_claims c ON c.id=ce.claim_id WHERE c.version_id=$1`,
        [editedVersionId],
      ),
    ).toHaveProperty("rowCount", 0);
    await expect(
      documents.supportClaimWithEvidence(first, {
        documentId: letterId,
        claimId: unverifiedClaim.rows[0]!.id,
        evidenceFactId: fact.rows[0]!.id,
      }),
    ).rejects.toBeInstanceOf(DocumentConflictError);
    const approvedManualFact = await runtimePool.query<{ id: string }>(
      `INSERT INTO evidence_facts (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
       VALUES ($1,$2,'statement',$3::jsonb,$4,$5::jsonb,$6) RETURNING id`,
      [
        first.workspaceId,
        entry.rows[0]!.id,
        JSON.stringify({ kind: "text", text: manualText }),
        manualText,
        JSON.stringify({ kind: "manual", label: "Approved edit fixture" }),
        first.userId,
      ],
    );
    const supportedManualVersion = await documents.supportClaimWithEvidence(
      first,
      {
        documentId: letterId,
        claimId: unverifiedClaim.rows[0]!.id,
        evidenceFactId: approvedManualFact.rows[0]!.id,
      },
    );
    expect(
      await runtimePool.query<{ status: string }>(
        `SELECT status FROM generated_claims WHERE version_id=$1`,
        [supportedManualVersion],
      ),
    ).toMatchObject({ rows: [{ status: "supported" }] });

    const rejectionBase = await documents.get(first, letterId);
    const rejectionBlock = rejectionBase.currentVersion.content.sections.find(
      (section) => section.type === "body",
    )!.blocks[0]!;
    const rejectedRun = await tailoring.prepareCoverLetterRun(first, {
      documentId: letterId,
      jobId,
      selectedEntryIds: [entry.rows[0]!.id],
      providerConfigurationId: provider.rows[0]!.id,
      tone: "formal",
      targetLength: "concise",
      idempotencyKey: "tailoring-reject-all",
    });
    await tailoring.completeResumeRun(first, rejectedRun.runId, {
      taskResults: [],
      gaps: [],
      suggestions: [
        {
          operation: "replace_block_text",
          targetSectionId: bodySection.id,
          targetBlockId: rejectionBlock.id,
          baseBlockHash: contentHash(rejectionBlock),
          beforeText: rejectionBlock.text,
          afterText: "Built synthetic systems",
          rationale: "Grounded proposal that the user rejects.",
          taskId: "AI-08",
          taskVersion: "ai-08.v1",
          requirementIds: [matchedRequirement.id],
          claims: [
            {
              start: 0,
              end: "Built synthetic systems".length,
              relation: "direct",
              evidenceFactIds: [fact.rows[0]!.id],
            },
          ],
        },
      ],
    });
    const rejectedView = await tailoring.getRun(first, rejectedRun.runId);
    expect(
      await tailoring.reviewRun(first, rejectedRun.runId, [
        {
          suggestionId: rejectedView.suggestions[0]!.id,
          decision: "rejected",
          editedText: "Built synthetic systems",
        },
      ]),
    ).toBeNull();
    expect((await documents.get(first, letterId)).currentVersion.id).toBe(
      rejectionBase.currentVersion.id,
    );
    await expect(
      tailoring.getRun(second, prepared.runId),
    ).rejects.toBeInstanceOf(TailoringNotFoundError);
    await expect(
      runtimePool.query(
        `UPDATE tailoring_runs SET manifest='{}'::jsonb WHERE id=$1`,
        [prepared.runId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    const unpinned = await runtimePool.query<{ id: string }>(
      `INSERT INTO evidence_facts (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
       VALUES ($1,$2,'statement','{"kind":"text","text":"Unpinned claim"}','Unpinned claim','{"kind":"manual","label":"Synthetic fixture"}',$3) RETURNING id`,
      [first.workspaceId, entry.rows[0]!.id, first.userId],
    );
    const unsafeRun = await prepare("tailoring-unpinned-evidence");
    await expect(
      tailoring.completeResumeRun(first, unsafeRun.runId, {
        taskResults: [],
        gaps: [],
        suggestions: [
          {
            operation: "replace_block_text",
            targetSectionId: experienceSection.id,
            targetBlockId: experienceBlock.id,
            baseBlockHash: contentHash(experienceBlock),
            beforeText: experienceBlock.text,
            afterText: "Unpinned claim",
            rationale: "Invalid synthetic attempt.",
            taskId: "AI-06",
            taskVersion: "ai-06.v1",
            requirementIds: [matchedRequirement.id],
            claims: [
              {
                start: 0,
                end: "Unpinned claim".length,
                relation: "direct",
                evidenceFactIds: [unpinned.rows[0]!.id],
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow("unknown or unselected evidence");

    await documents.setLock(first, {
      documentId: resumeId,
      targetType: "block",
      targetId: experienceBlock.id,
      locked: true,
    });
    const lockedRun = await prepare("tailoring-locked-block");
    expect(lockedRun.lockedBlockIds.has(experienceBlock.id)).toBe(true);
    await expect(
      tailoring.completeResumeRun(first, lockedRun.runId, {
        taskResults: [],
        gaps: [],
        suggestions: [
          {
            operation: "replace_block_text",
            targetSectionId: experienceSection.id,
            targetBlockId: experienceBlock.id,
            baseBlockHash: contentHash(experienceBlock),
            beforeText: experienceBlock.text,
            afterText: proposed,
            rationale: "Invalid locked change.",
            taskId: "AI-06",
            taskVersion: "ai-06.v1",
            requirementIds: [matchedRequirement.id],
            claims: [
              {
                start: 0,
                end: proposed.length,
                relation: "direct",
                evidenceFactIds: [fact.rows[0]!.id],
              },
            ],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(TailoringInputConflictError);

    const latest = await documents.get(first, resumeId);
    const changed = structuredClone(latest.currentVersion.content);
    changed.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.id === experienceBlock.id)!.text =
      "Changed after locking";
    await documents.commitVersion(first, {
      documentId: resumeId,
      baseVersionId: latest.currentVersion.id,
      content: changed,
    });
    await expect(prepare("tailoring-stale-lock")).rejects.toBeInstanceOf(
      TailoringInputConflictError,
    );
    await expect(
      tailoring.prepareResumeRun(second, {
        documentId: resumeId,
        jobId,
        selectedEntryIds: [entry.rows[0]!.id],
        providerConfigurationId: provider.rows[0]!.id,
        tone: "direct",
        targetLength: "standard",
        idempotencyKey: "tailoring-cross-workspace",
      }),
    ).rejects.toBeInstanceOf(TailoringNotFoundError);
  });
});
