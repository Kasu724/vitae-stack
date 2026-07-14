// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Pool } from "@/infrastructure/database/sqlite-pool";
import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../helpers/sqlite-test-database";
import {
  CareerConflictError,
  CareerDocumentDependencyError,
  CareerNotFoundError,
  CareerRepository,
} from "@/modules/career/repository";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { DocumentRepository } from "@/modules/documents/repository";
import { JobRepository } from "@/modules/jobs/repository";
import { MatchingRepository } from "@/modules/matching/repository";
import { RequirementRepository } from "@/modules/requirements/repository";

let testDatabase: SqliteTestDatabase;
let runtimePool: Pool;
let repository: CareerRepository;
let first: WorkspacePrincipal;
let second: WorkspacePrincipal;

async function createPrincipal(label: string): Promise<WorkspacePrincipal> {
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
  testDatabase = await createSqliteTestDatabase("career");
  runtimePool = testDatabase.pool;
  repository = new CareerRepository(runtimePool);
  first = await createPrincipal("career-first");
  second = await createPrincipal("career-second");
}, 120_000);

afterAll(async () => {
  await testDatabase?.cleanup();
});

describe("Career Information Bank lifecycle", () => {
  it("creates, searches, filters, archives, and isolates workspace entries", async () => {
    const id = await repository.createEntry(first, {
      type: "work",
      title: "Synthetic platform engineer",
      organization: "Example Corp",
      location: null,
      description: "Built private systems",
      startDate: "2022-05",
      endDate: undefined,
      isCurrent: true,
      tags: ["typescript", "privacy"],
    });
    expect(
      (await repository.listEntries(first, { query: "private" })).map(
        (entry) => entry.id,
      ),
    ).toContain(id);
    expect(await repository.countEntries(first, { query: "private" })).toBe(1);
    expect(
      await repository.listEntries(first, {
        query: "private",
        limit: 1,
        offset: 1,
      }),
    ).toEqual([]);
    expect(await repository.listEntries(second, { query: "private" })).toEqual(
      [],
    );
    await expect(repository.getEntry(second, id)).rejects.toBeInstanceOf(
      CareerNotFoundError,
    );

    const entry = (await repository.getEntry(first, id)).entry;
    await repository.updateEntry(first, id, entry.revision, {
      type: "work",
      title: "Synthetic staff engineer",
      organization: "Example Corp",
      location: null,
      description: "Built private systems",
      startDate: "2022-05",
      endDate: undefined,
      isCurrent: true,
      tags: ["typescript", "privacy"],
    });
    await expect(
      repository.updateEntry(first, id, entry.revision, {
        type: "work",
        title: "Stale edit",
        organization: null,
        location: null,
        description: null,
        startDate: undefined,
        endDate: undefined,
        isCurrent: false,
        tags: [],
      }),
    ).rejects.toBeInstanceOf(CareerConflictError);
    await repository.setArchived(first, id, true);
    expect(await repository.listEntries(first)).toEqual([]);
    expect(
      await repository.listEntries(first, { status: "archived" }),
    ).toHaveLength(1);
    await repository.setArchived(first, id, false);
  });

  it("keeps proposals ineligible until approval and preserves immutable fact history", async () => {
    const entryId = await repository.createEntry(first, {
      type: "accomplishment",
      title: "Synthetic result",
      organization: null,
      location: null,
      description: null,
      startDate: undefined,
      endDate: undefined,
      isCurrent: false,
      tags: ["impact"],
    });
    const proposalId = await repository.createProposal(first, entryId, {
      type: "metric",
      displayText: "Reduced synthetic latency by 20%",
      value: {
        kind: "metric",
        value: 20,
        unit: "%",
        context: "p95 API latency",
      },
      sourceLocator: {
        kind: "manual",
        label: "Manual entry",
        section: "Impact",
      },
    });
    expect(await repository.listEligibleFacts(first)).toEqual([]);
    const factId = await repository.approveProposal(first, proposalId);
    const approved = await repository.listEligibleFacts(first);
    expect(approved).toHaveLength(1);
    expect(approved[0]).toMatchObject({
      id: factId,
      status: "approved",
      source_locator: { label: "Manual entry" },
    });

    await expect(
      runtimePool.query(
        "UPDATE evidence_facts SET display_text='tampered' WHERE id=$1",
        [factId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    const replacementId = await repository.supersedeFact(first, factId, {
      type: "metric",
      displayText: "Reduced synthetic latency by 18%",
      value: {
        kind: "metric",
        value: 18,
        unit: "%",
        context: "p95 API latency",
      },
      sourceLocator: { kind: "manual", label: "Manual correction" },
    });
    expect(
      (await repository.listEligibleFacts(first)).map((fact) => fact.id),
    ).toEqual([replacementId]);
    const history = await repository.getEntry(first, entryId);
    expect(history.facts.find((fact) => fact.id === factId)?.status).toBe(
      "superseded",
    );
    expect(
      history.facts.find((fact) => fact.id === replacementId)
        ?.supersedes_fact_id,
    ).toBe(factId);

    await repository.withdrawFact(first, replacementId);
    expect(await repository.listEligibleFacts(first)).toEqual([]);
    const audit = await runtimePool.query<{
      metadata: Record<string, unknown>;
    }>(
      "SELECT metadata FROM audit_events WHERE workspace_id=$1 AND action LIKE 'fact.%'",
      [first.workspaceId],
    );
    expect(JSON.stringify(audit.rows)).not.toContain("latency");
    expect(JSON.stringify(audit.rows)).not.toContain("18%");
  });

  it("previews and deletes only the selected entry dependency graph", async () => {
    const entryId = await repository.createEntry(first, {
      type: "project",
      title: "Disposable synthetic project",
      organization: null,
      location: null,
      description: null,
      startDate: undefined,
      endDate: undefined,
      isCurrent: false,
      tags: [],
    });
    await repository.createProposal(first, entryId, {
      type: "statement",
      displayText: "Synthetic pending fact",
      value: { kind: "text", text: "Synthetic pending fact" },
      sourceLocator: { kind: "manual", label: "Manual entry" },
    });
    expect(await repository.dependencyPreview(first, entryId)).toEqual({
      documentClaims: 0,
      facts: 0,
      extractionBatches: 0,
      matchingRuns: 0,
      proposals: 1,
      skillLinks: 0,
      tailoringRuns: 0,
    });
    await expect(
      repository.deleteEntry(second, entryId),
    ).rejects.toBeInstanceOf(CareerNotFoundError);
    await repository.deleteEntry(first, entryId);
    await expect(repository.getEntry(first, entryId)).rejects.toBeInstanceOf(
      CareerNotFoundError,
    );
  });

  it("deletes derived matching and tailoring runs before their evidence entry", async () => {
    const entryId = await repository.createEntry(first, {
      type: "project",
      title: "Disposable matched project",
      organization: null,
      location: null,
      description: null,
      startDate: undefined,
      endDate: undefined,
      isCurrent: false,
      tags: [],
    });
    const proposalId = await repository.createProposal(first, entryId, {
      type: "statement",
      displayText: "Built deterministic privacy systems",
      value: {
        kind: "text",
        text: "Built deterministic privacy systems",
      },
      sourceLocator: { kind: "manual", label: "Synthetic fixture" },
    });
    await repository.approveProposal(first, proposalId);

    const jobs = new JobRepository(runtimePool);
    const jobId = await jobs.createFromText(first, {
      title: "Synthetic deletion role",
      company: "Example Company",
      text: "Build deterministic privacy systems",
    });
    const revision = (await jobs.get(first, jobId)).revisions[0]!;
    const requirements = new RequirementRepository(runtimePool);
    const requirementSetId = await requirements.createDraft(first, {
      jobRevisionId: revision.id,
      method: "deterministic",
      metadata: {
        schemaVersion: 1,
        taskVersion: "deterministic-lines@1",
        warnings: [],
        inputHash: `sha256:${"a".repeat(64)}`,
      },
      proposals: [],
    });
    await requirements.addManualRequirement(first, requirementSetId, {
      category: "required_qualification",
      priority: "required",
      requirementText: "Build deterministic privacy systems",
    });
    await requirements.finalize(first, requirementSetId);
    const matching = new MatchingRepository(runtimePool);
    const matchRunId = await matching.generate(first, requirementSetId);

    const documents = new DocumentRepository(runtimePool);
    const documentId = await documents.create(first, {
      kind: "resume",
      title: "Synthetic deletion resume",
    });
    const document = await documents.get(first, documentId);
    const tailoringRun = await runtimePool.query<{ id: string }>(
      `INSERT INTO tailoring_runs
         (workspace_id,kind,document_id,base_version_id,job_posting_revision_id,
          requirement_set_id,match_run_id,status,idempotency_key,manifest,created_by_user_id)
       VALUES ($1,'resume',$2,$3,$4,$5,$6,'ready',$7,'{}',$8) RETURNING id`,
      [
        first.workspaceId,
        documentId,
        document.currentVersion.id,
        revision.id,
        requirementSetId,
        matchRunId,
        crypto.randomUUID(),
        first.userId,
      ],
    );
    const tailoringRunId = tailoringRun.rows[0]!.id;
    const fact = await runtimePool.query<{ id: string }>(
      "SELECT id FROM evidence_facts WHERE career_entry_id=$1 AND workspace_id=$2",
      [entryId, first.workspaceId],
    );
    await runtimePool.query(
      "INSERT INTO tailoring_run_entries (workspace_id,run_id,career_entry_id) VALUES ($1,$2,$3)",
      [first.workspaceId, tailoringRunId, entryId],
    );
    await runtimePool.query(
      "INSERT INTO tailoring_run_evidence (workspace_id,run_id,evidence_fact_id) VALUES ($1,$2,$3)",
      [first.workspaceId, tailoringRunId, fact.rows[0]!.id],
    );

    expect(await repository.dependencyPreview(first, entryId)).toMatchObject({
      documentClaims: 0,
      facts: 1,
      matchingRuns: 1,
      tailoringRuns: 1,
    });
    await repository.deleteEntry(first, entryId);
    expect(
      await runtimePool.query(
        "SELECT id FROM requirement_match_runs WHERE id=$1",
        [matchRunId],
      ),
    ).toMatchObject({ rowCount: 0 });
    expect(
      await runtimePool.query("SELECT id FROM tailoring_runs WHERE id=$1", [
        tailoringRunId,
      ]),
    ).toMatchObject({ rowCount: 0 });
    await expect(repository.getEntry(first, entryId)).rejects.toBeInstanceOf(
      CareerNotFoundError,
    );
  });

  it("refuses entry deletion when immutable document claims depend on it", async () => {
    const entryId = await repository.createEntry(first, {
      type: "project",
      title: "Document-backed project",
      organization: null,
      location: null,
      description: null,
      startDate: undefined,
      endDate: undefined,
      isCurrent: false,
      tags: [],
    });
    const proposalId = await repository.createProposal(first, entryId, {
      type: "statement",
      displayText: "Grounded saved claim",
      value: { kind: "text", text: "Grounded saved claim" },
      sourceLocator: { kind: "manual", label: "Synthetic fixture" },
    });
    const factId = await repository.approveProposal(first, proposalId);
    const documents = new DocumentRepository(runtimePool);
    const documentId = await documents.create(first, {
      kind: "resume",
      title: "Claim dependency resume",
    });
    const document = await documents.get(first, documentId);
    const claim = await runtimePool.query<{ id: string }>(
      `INSERT INTO generated_claims
         (workspace_id,version_id,stable_block_id,start_offset,end_offset,text_hash,status)
       VALUES ($1,$2,'synthetic-claim',0,1,$3,'supported') RETURNING id`,
      [
        first.workspaceId,
        document.currentVersion.id,
        `sha256:${"b".repeat(64)}`,
      ],
    );
    await runtimePool.query(
      "INSERT INTO claim_evidence (workspace_id,claim_id,evidence_fact_id) VALUES ($1,$2,$3)",
      [first.workspaceId, claim.rows[0]!.id, factId],
    );
    const otherwiseDeletableId = await repository.createEntry(first, {
      type: "project",
      title: "Atomic deletion companion",
      organization: null,
      location: null,
      description: null,
      startDate: undefined,
      endDate: undefined,
      isCurrent: false,
      tags: [],
    });

    expect(await repository.dependencyPreview(first, entryId)).toMatchObject({
      documentClaims: 1,
    });
    await expect(repository.deleteEntry(first, entryId)).rejects.toBeInstanceOf(
      CareerDocumentDependencyError,
    );
    await expect(
      repository.deleteEntries(first, [otherwiseDeletableId, entryId]),
    ).rejects.toBeInstanceOf(CareerDocumentDependencyError);
    await expect(repository.getEntry(first, entryId)).resolves.toBeDefined();
    await expect(
      repository.getEntry(first, otherwiseDeletableId),
    ).resolves.toBeDefined();
  });

  it("rejects cross-workspace skill links at the database boundary", async () => {
    const entryId = await repository.createEntry(first, {
      type: "skill",
      title: "TypeScript",
      organization: null,
      location: null,
      description: null,
      startDate: undefined,
      endDate: undefined,
      isCurrent: false,
      tags: [],
    });
    const skill = await runtimePool.query<{ id: string }>(
      "INSERT INTO skills (workspace_id,canonical_name,display_name) VALUES ($1,'typescript','TypeScript') RETURNING id",
      [second.workspaceId],
    );
    await expect(
      runtimePool.query(
        "INSERT INTO career_entry_skills (workspace_id,career_entry_id,skill_id) VALUES ($1,$2,$3)",
        [first.workspaceId, entryId, skill.rows[0]!.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("stores reusable skills and non-secret profile preferences in the workspace", async () => {
    const entryId = await repository.createEntry(first, {
      type: "work",
      title: "Skill link fixture",
      organization: null,
      location: null,
      description: null,
      startDate: undefined,
      endDate: undefined,
      isCurrent: false,
      tags: [],
    });
    const skillId = await repository.createSkill(first, {
      displayName: "TypeScript",
      category: "Programming language",
      aliases: ["TS"],
    });
    await repository.linkSkill(first, entryId, skillId, "advanced");
    expect(await repository.listEntrySkills(first, entryId)).toEqual([
      expect.objectContaining({
        id: skillId,
        display_name: "TypeScript",
        proficiency: "advanced",
      }),
    ]);
    expect(
      (await repository.listSkills(second)).map((skill) => skill.id),
    ).not.toContain(skillId);
    expect(
      (await repository.listSkills(first)).map((skill) => skill.id),
    ).toContain(skillId);

    await repository.getProfileSettings(first);
    await repository.updateProfileSettings(first, {
      careerGoals: ["Build safe systems"],
      targetRoles: ["Staff engineer"],
      tone: "direct",
    });
    expect(await repository.getProfileSettings(first)).toMatchObject({
      careerGoals: ["Build safe systems"],
      targetRoles: ["Staff engineer"],
      writingPreferences: { tone: "direct" },
    });
    expect(await repository.getProfileSettings(second)).toMatchObject({
      careerGoals: [],
      targetRoles: [],
    });
  });
});
