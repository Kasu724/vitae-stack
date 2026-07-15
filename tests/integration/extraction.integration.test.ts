// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Pool } from "@/infrastructure/database/sqlite-pool";
import { sourceStorageKey } from "@/infrastructure/artifacts/filesystem-store";
import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../helpers/sqlite-test-database";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { CareerRepository } from "@/modules/career/repository";
import {
  hashExtractionValue,
  type AiExtractionProposal,
} from "@/modules/extraction/domain";
import {
  ExtractionConflictError,
  ExtractionNotFoundError,
  ExtractionRepository,
} from "@/modules/extraction/repository";
import {
  SourceDependencyError,
  SourceRepository,
} from "@/modules/ingestion/source-repository";

let testDatabase: SqliteTestDatabase;
let runtimePool: Pool;
let repository: ExtractionRepository;
let career: CareerRepository;
let first: WorkspacePrincipal;
let second: WorkspacePrincipal;

async function createPrincipal(label: string): Promise<WorkspacePrincipal> {
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

async function readySource(
  principal: WorkspacePrincipal,
  label: string,
  text: string,
): Promise<string> {
  const sourceId = crypto.randomUUID();
  const result = await runtimePool.query<{ id: string }>(
    `INSERT INTO source_documents
      (id,workspace_id,uploaded_by_user_id,purpose,original_name,declared_media_type,detected_media_type,byte_size,content_hash,storage_key,status,extracted_text,parser_version,processed_at)
     VALUES ($1,$2,$3,'career_evidence',$4,'text/plain','text/plain',$5,$6,$7,'ready',$8,'plain-text@1',now()) RETURNING id`,
    [
      sourceId,
      principal.workspaceId,
      principal.userId,
      `${label}.txt`,
      Buffer.byteLength(text),
      `sha256:${"a".repeat(63)}${label.length % 10}`,
      sourceStorageKey(principal.workspaceId, sourceId),
      text,
    ],
  );
  return result.rows[0]!.id;
}

beforeAll(async () => {
  testDatabase = await createSqliteTestDatabase("extraction");
  runtimePool = testDatabase.pool;
  repository = new ExtractionRepository(runtimePool);
  career = new CareerRepository(runtimePool);
  first = await createPrincipal("extraction-first");
  second = await createPrincipal("extraction-second");
}, 120_000);

afterAll(async () => {
  await testDatabase?.cleanup();
});

describe("extraction review and approval", () => {
  it("stores AI proposals atomically as unverified exact spans and preserves entry grouping", async () => {
    const aiPrincipal = await createPrincipal("ai-grouping");
    const text = [
      "Synthetic Employer",
      "Built synthetic systems",
      "Synthetic Project",
      "Shipped a synthetic project",
    ].join("\n");
    const sourceId = await readySource(aiPrincipal, "ai-extraction", text);
    const exact = (value: string) => ({
      start: text.indexOf(value),
      end: text.indexOf(value) + value.length,
      text: value,
    });
    const employer = exact("Synthetic Employer");
    const built = exact("Built synthetic systems");
    const project = exact("Synthetic Project");
    const shipped = exact("Shipped a synthetic project");
    const proposals: AiExtractionProposal[] = [
      {
        entryKey: "employment_1",
        entryType: "work",
        entryTitleStart: employer.start,
        entryTitleEnd: employer.end,
        entryTitleText: employer.text,
        factType: "statement",
        sourceStart: built.start,
        sourceEnd: built.end,
        sourceText: built.text,
      },
      {
        entryKey: "project_1",
        entryType: "project",
        entryTitleStart: project.start,
        entryTitleEnd: project.end,
        entryTitleText: project.text,
        factType: "accomplishment",
        sourceStart: shipped.start,
        sourceEnd: shipped.end,
        sourceText: shipped.text,
      },
    ];
    const metadata = {
      schemaVersion: 1 as const,
      taskVersion: "ai-01.v1" as const,
      warnings: [],
      providerConfigurationId: "40000000-0000-4000-8000-000000000001",
      model: "synthetic-model",
      attempts: 1,
      inputHash: hashExtractionValue(text),
      outputHash: hashExtractionValue({
        schemaVersion: "ai-01.v1",
        proposals,
        warnings: [],
      }),
    };
    const source = await runtimePool.query<{ content_hash: string }>(
      "SELECT content_hash FROM source_documents WHERE id=$1",
      [sourceId],
    );
    const batchId = await repository.createAiBatch(aiPrincipal, {
      sourceId,
      expectedSourceContentHash: source.rows[0]!.content_hash,
      proposals,
      metadata,
    });
    const review = await repository.getBatch(aiPrincipal, batchId);
    expect(review.batch).toMatchObject({
      method: "ai",
      task_version: "ai-01.v1",
      metadata: expect.objectContaining({
        model: "synthetic-model",
        inputHash: metadata.inputHash,
      }),
    });
    expect(review.proposals).toEqual([
      expect.objectContaining({
        status: "pending",
        proposed_entry_key: "employment_1",
        source_locator: expect.objectContaining({
          sourceDocumentId: sourceId,
          startOffset: built.start,
          endOffset: built.end,
        }),
      }),
      expect.objectContaining({
        status: "pending",
        proposed_entry_key: "project_1",
        source_locator: expect.objectContaining({
          sourceDocumentId: sourceId,
          startOffset: shipped.start,
          endOffset: shipped.end,
        }),
      }),
    ]);
    expect(await career.listEligibleFacts(aiPrincipal)).toEqual([]);
    await repository.approve(aiPrincipal, review.proposals[0]!.id);
    await repository.approve(aiPrincipal, review.proposals[1]!.id);
    const entries = await runtimePool.query<{ career_entry_id: string }>(
      "SELECT DISTINCT career_entry_id FROM evidence_facts WHERE workspace_id=$1 AND display_text=ANY($2::text[])",
      [
        aiPrincipal.workspaceId,
        proposals.map((proposal) => proposal.sourceText),
      ],
    );
    expect(entries.rows).toHaveLength(2);
    const audit = await runtimePool.query<{ metadata: unknown }>(
      "SELECT metadata FROM audit_events WHERE target_id=$1",
      [batchId],
    );
    const serializedAudit = JSON.stringify(audit.rows);
    expect(serializedAudit).not.toContain(text);
    expect(serializedAudit).not.toContain(built.text);
    expect(serializedAudit).toContain(metadata.inputHash);
  });

  it("persists no AI batch when the pinned source hash changed", async () => {
    const aiPrincipal = await createPrincipal("ai-race");
    const text = "Synthetic Employer\nBuilt synthetic systems";
    const sourceId = await readySource(aiPrincipal, "ai-race", text);
    await expect(
      repository.createAiBatch(aiPrincipal, {
        sourceId,
        expectedSourceContentHash: `sha256:${"f".repeat(64)}`,
        proposals: [],
        metadata: {
          schemaVersion: 1,
          taskVersion: "ai-01.v1",
          warnings: [],
          providerConfigurationId: "40000000-0000-4000-8000-000000000001",
          model: "synthetic-model",
          attempts: 1,
          inputHash: hashExtractionValue(text),
          outputHash: hashExtractionValue({
            schemaVersion: "ai-01.v1",
            proposals: [],
            warnings: [],
          }),
        },
      }),
    ).rejects.toBeInstanceOf(ExtractionConflictError);
    const rows = await runtimePool.query<{ count: string }>(
      "SELECT count(*)::text count FROM extraction_batches WHERE source_document_id=$1",
      [sourceId],
    );
    expect(Number(rows.rows[0]!.count)).toBe(0);
  });

  it("keeps candidates ineligible, preserves locators, and isolates workspaces", async () => {
    const sourceId = await readySource(
      first,
      "locator",
      "Synthetic heading\n\n- Built a synthetic control",
    );
    const batchId = await repository.createDeterministicBatch(first, sourceId);
    const review = await repository.getBatch(first, batchId);
    expect(review.proposals.map((proposal) => proposal.source_locator)).toEqual(
      [
        expect.objectContaining({
          label: "Line 1",
          section: "Line 1 · Additional information",
          sourceDocumentId: sourceId,
        }),
        expect.objectContaining({
          label: "Line 3",
          section: "Line 3 · Additional information",
          sourceDocumentId: sourceId,
        }),
      ],
    );
    expect(await career.listEligibleFacts(first)).toEqual([]);
    await expect(repository.getBatch(second, batchId)).rejects.toBeInstanceOf(
      ExtractionNotFoundError,
    );
  });

  it("keeps deterministic section items separate through approval", async () => {
    const principal = await createPrincipal("deterministic-grouping");
    const sourceId = await readySource(
      principal,
      "grouped-resume",
      [
        "EXPERIENCE",
        "Synthetic Labs — Engineer",
        "- Built a private parser",
        "",
        "Example Co — Intern",
        "- Shipped a local import flow",
        "",
        "PROJECTS",
        "Private Portfolio",
        "- Used TypeScript",
      ].join("\n"),
    );
    const batchId = await repository.createDeterministicBatch(
      principal,
      sourceId,
    );
    const review = await repository.getBatch(principal, batchId);
    expect(
      new Set(review.proposals.map((item) => item.proposed_entry_key)),
    ).toEqual(new Set(["work_1", "work_2", "project_1"]));
    await repository.bulkApprove(
      principal,
      review.proposals.map((proposal) => proposal.id),
    );
    const entries = await career.listEntries(principal);
    expect(
      entries.map(({ type, title, approved_fact_count }) => ({
        type,
        title,
        approved_fact_count,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          type: "work",
          title: "Synthetic Labs — Engineer",
          approved_fact_count: 2,
        },
        { type: "work", title: "Example Co — Intern", approved_fact_count: 2 },
        { type: "project", title: "Private Portfolio", approved_fact_count: 2 },
      ]),
    );
  });

  it("edits then approves exactly once with immutable evidence and safe audit metadata", async () => {
    const sourceId = await readySource(
      first,
      "approval",
      "Initial synthetic claim",
    );
    const batchId = await repository.createDeterministicBatch(first, sourceId);
    const proposal = (await repository.getBatch(first, batchId)).proposals[0]!;
    await repository.updateProposal(first, proposal.id, proposal.revision, {
      entryType: "project",
      entryTitle: "Synthetic extraction project",
      targetCareerEntryId: null,
      fact: {
        type: "statement",
        displayText: "Edited synthetic claim",
        value: { kind: "text", text: "Edited synthetic claim" },
      },
    });
    const factId = await repository.approve(first, proposal.id);
    expect(await career.listEligibleFacts(first)).toEqual([
      expect.objectContaining({
        id: factId,
        display_text: "Edited synthetic claim",
        source_locator: expect.objectContaining({ sourceDocumentId: sourceId }),
      }),
    ]);
    await expect(repository.approve(first, proposal.id)).rejects.toBeInstanceOf(
      ExtractionConflictError,
    );
    await expect(
      runtimePool.query(
        "UPDATE extraction_proposals SET display_text='tampered' WHERE id=$1",
        [proposal.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const audit = await runtimePool.query<{ metadata: unknown }>(
      "SELECT metadata FROM audit_events WHERE target_id=$1",
      [batchId],
    );
    expect(JSON.stringify(audit.rows)).not.toContain("Edited synthetic claim");
    expect(JSON.stringify(audit.rows)).not.toContain("Initial synthetic claim");
  });

  it("approves or rejects checkbox selections as transactional batches", async () => {
    const claims = Array.from(
      { length: 25 },
      (_, index) => `Synthetic bulk claim ${index + 1}`,
    );
    const sourceId = await readySource(first, "bulk", claims.join("\n"));
    const batchId = await repository.createDeterministicBatch(first, sourceId);
    const proposals = (await repository.getBatch(first, batchId)).proposals;
    expect(proposals).toHaveLength(25);
    await repository.bulkReject(first, [proposals[0]!.id]);
    expect(
      await repository.bulkApprove(
        first,
        proposals.slice(1).map((proposal) => proposal.id),
      ),
    ).toHaveLength(24);
    expect((await repository.getBatch(first, batchId)).batch.status).toBe(
      "completed",
    );
  });

  it("merges an exact duplicate without creating another evidence fact", async () => {
    const entryId = await career.createEntry(first, {
      type: "accomplishment",
      title: "Synthetic duplicate fixture",
      organization: null,
      location: null,
      description: null,
      startDate: undefined,
      endDate: undefined,
      isCurrent: false,
      tags: [],
    });
    const proposalId = await career.createProposal(first, entryId, {
      type: "statement",
      displayText: "Built the synthetic duplicate fixture",
      value: { kind: "text", text: "Built the synthetic duplicate fixture" },
      sourceLocator: { kind: "manual", label: "Synthetic fixture" },
    });
    const existingFactId = await career.approveProposal(first, proposalId);
    const sourceId = await readySource(
      first,
      "duplicate",
      "Built the synthetic duplicate fixture",
    );
    const batchId = await repository.createDeterministicBatch(first, sourceId);
    const extracted = (await repository.getBatch(first, batchId)).proposals[0]!;
    expect(extracted.duplicate_of_fact_id).toBe(existingFactId);
    expect(await repository.mergeDuplicate(first, extracted.id)).toBe(
      existingFactId,
    );
    expect(
      (await career.listEligibleFacts(first)).filter(
        (fact) => fact.display_text === "Built the synthetic duplicate fixture",
      ),
    ).toHaveLength(1);
  });

  it("blocks source deletion during review and preserves resolved audit history", async () => {
    const sourceId = await readySource(
      first,
      "delete-race",
      "Synthetic deletion review claim",
    );
    const batchId = await repository.createDeterministicBatch(first, sourceId);
    const sources = new SourceRepository(runtimePool);
    let artifactDeletionCalled = false;
    await expect(
      sources.deleteWithArtifacts(first, sourceId, async () => {
        artifactDeletionCalled = true;
      }),
    ).rejects.toBeInstanceOf(SourceDependencyError);
    expect(artifactDeletionCalled).toBe(false);
    const proposal = (await repository.getBatch(first, batchId)).proposals[0]!;
    await repository.reject(first, proposal.id);
    await sources.deleteWithArtifacts(first, sourceId, async () => {
      artifactDeletionCalled = true;
    });
    expect(artifactDeletionCalled).toBe(true);
    const review = await repository.getBatch(first, batchId);
    expect(review.batch.source_available).toBe(false);
    expect(review.batch.extracted_text).toBe("");
    expect(review.proposals[0]!.status).toBe("rejected");
  });
});
