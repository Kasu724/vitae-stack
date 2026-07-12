// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Pool } from "@/infrastructure/database/sqlite-pool";
import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../helpers/sqlite-test-database";
import { AtsInputNotFoundError, AtsRepository } from "@/modules/ats/repository";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { DocumentRepository } from "@/modules/documents/repository";
import { JobRepository } from "@/modules/jobs/repository";
import { MatchingRepository } from "@/modules/matching/repository";
import { RequirementRepository } from "@/modules/requirements/repository";
import { RequirementAnalysisService } from "@/modules/requirements/service";

let testDatabase: SqliteTestDatabase;
let runtimePool: Pool;
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
    mode: "trusted-local",
    userId: user.rows[0]!.id,
    workspaceId: workspace.rows[0]!.id,
  };
}

beforeAll(async () => {
  testDatabase = await createSqliteTestDatabase("ats");
  runtimePool = testDatabase.pool;
  first = await principal("ats-first");
  second = await principal("ats-second");
}, 120_000);

afterAll(async () => {
  await testDatabase?.cleanup();
});

describe("persisted deterministic ATS reports", () => {
  it("pins inputs, reuses identical runs, isolates workspaces, and remains immutable", async () => {
    const documents = new DocumentRepository(runtimePool);
    const documentId = await documents.create(first, {
      kind: "resume",
      title: "Synthetic ATS resume",
    });
    const initial = await documents.get(first, documentId);
    const content = structuredClone(initial.currentVersion.content);
    content.sections[0]!.blocks[0]!.text = "alex@example.test";
    const experience = content.sections.find(
      (section) => section.type === "experience",
    )!;
    const block = experience.blocks[0]!;
    block.text = "Built synthetic systems in 2025 with 20% less latency.";
    await documents.commitVersion(first, {
      documentId,
      baseVersionId: initial.currentVersion.id,
      content,
    });

    const entry = await runtimePool.query<{ id: string }>(
      `INSERT INTO career_entries (workspace_id,career_profile_id,type,title,description)
       SELECT $1,id,'project','Synthetic ATS project','Fixture' FROM career_profiles WHERE workspace_id=$1 RETURNING id`,
      [first.workspaceId],
    );
    const fact = await runtimePool.query<{ id: string }>(
      `INSERT INTO evidence_facts (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
       VALUES ($1,$2,'statement',$3::jsonb,$4,$5::jsonb,$6) RETURNING id`,
      [
        first.workspaceId,
        entry.rows[0]!.id,
        JSON.stringify({ kind: "text", text: block.text }),
        block.text,
        JSON.stringify({ kind: "manual", label: "Synthetic ATS fixture" }),
        first.userId,
      ],
    );
    const contactFact = await runtimePool.query<{ id: string }>(
      `INSERT INTO evidence_facts (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
       VALUES ($1,$2,'statement',$3::jsonb,$4,$5::jsonb,$6) RETURNING id`,
      [
        first.workspaceId,
        entry.rows[0]!.id,
        JSON.stringify({ kind: "text", text: "alex@example.test" }),
        "alex@example.test",
        JSON.stringify({ kind: "manual", label: "Synthetic ATS fixture" }),
        first.userId,
      ],
    );
    for (const [claimText, evidenceFactId] of [
      ["alex@example.test", contactFact.rows[0]!.id],
      [block.text, fact.rows[0]!.id],
    ] as const) {
      const claim = (await documents.listClaims(first, documentId)).find(
        (item) => item.text === claimText,
      )!;
      await documents.supportClaimWithEvidence(first, {
        documentId,
        claimId: claim.id,
        evidenceFactId,
      });
    }

    const jobs = new JobRepository(runtimePool);
    const jobId = await jobs.createFromText(first, {
      title: "Synthetic systems role",
      company: "Example Company",
      text: "Requirements:\n- Built synthetic systems",
    });
    const job = await jobs.get(first, jobId);
    const requirementRepository = new RequirementRepository(runtimePool);
    const setId = await new RequirementAnalysisService(
      requirementRepository,
    ).createDeterministicDraft(
      first,
      job.revisions[0]!.id,
      job.revisions[0]!.normalized_text,
    );
    const draft = (
      await requirementRepository.listForJobRevision(
        first,
        job.revisions[0]!.id,
      )
    )[0]!;
    for (const requirement of draft.requirements)
      await requirementRepository.reviseRequirement(first, {
        setId,
        requirementId: requirement.id,
        category: "required_qualification",
        priority: "required",
        decision: "accepted",
        requirementText: requirement.requirement_text,
      });
    await requirementRepository.finalize(first, setId);
    const matching = new MatchingRepository(runtimePool);
    await matching.generate(first, setId);
    const matrix = (await matching.getLatestMatrix(first, setId))!;
    const candidate = matrix.requirements
      .flatMap((requirement) => requirement.candidates)
      .find((item) => item.evidence_fact_id === fact.rows[0]!.id)!;
    expect(candidate).toBeDefined();
    await matching.decide(first, candidate.id, "included");

    const repository = new AtsRepository(runtimePool);
    const reportId = await repository.generate(first, { documentId, jobId });
    expect(await repository.generate(first, { documentId, jobId })).toBe(
      reportId,
    );
    const report = await repository.getReport(first, reportId);
    expect(report.categories).toHaveLength(15);
    expect(report.report).toMatchObject({
      id: reportId,
      document_id: documentId,
      job_id: jobId,
      blocker_count: 0,
    });
    expect(report.report.input_hash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    await expect(repository.getReport(second, reportId)).rejects.toBeInstanceOf(
      AtsInputNotFoundError,
    );
    await expect(
      runtimePool.query("UPDATE ats_reports SET blocker_count=99 WHERE id=$1", [
        reportId,
      ]),
    ).rejects.toMatchObject({ code: "23514" });

    const currentVersion = (await documents.get(first, documentId))
      .currentVersion.id;
    await expect(
      runtimePool.query(
        "DELETE FROM generated_claims WHERE version_id=$1 AND workspace_id=$2",
        [currentVersion, first.workspaceId],
      ),
    ).rejects.toThrow("immutable history cannot be deleted");
    const corruptionFixture = await runtimePool.connect();
    try {
      await corruptionFixture.query("BEGIN");
      corruptionFixture.authorizeWorkspaceDeletion();
      await corruptionFixture.query(
        "DELETE FROM generated_claims WHERE version_id=$1 AND workspace_id=$2",
        [currentVersion, first.workspaceId],
      );
      await corruptionFixture.query("COMMIT");
    } catch (error) {
      await corruptionFixture.query("ROLLBACK");
      throw error;
    } finally {
      corruptionFixture.release();
    }
    const incompleteReportId = await repository.generate(first, {
      documentId,
      jobId,
    });
    const incompleteReport = await repository.getReport(
      first,
      incompleteReportId,
    );
    expect(incompleteReport.report.blocker_count).toBeGreaterThan(0);
    expect(incompleteReport.findings).toContainEqual(
      expect.objectContaining({ rule_id: "ATS-UNSUP-001", blocker: true }),
    );
  });
});
