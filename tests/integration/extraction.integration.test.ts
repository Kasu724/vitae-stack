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
import { CareerRepository } from "@/modules/career/repository";
import {
  ExtractionConflictError,
  ExtractionNotFoundError,
  ExtractionRepository,
} from "@/modules/extraction/repository";
import {
  SourceDependencyError,
  SourceRepository,
} from "@/modules/ingestion/source-repository";

let container: StartedPostgreSqlContainer;
let ownerPool: Pool;
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
    mode: "password",
    userId: user.rows[0]!.id,
    workspaceId: workspace.rows[0]!.id,
  };
}

async function readySource(
  principal: WorkspacePrincipal,
  label: string,
  text: string,
): Promise<string> {
  const result = await runtimePool.query<{ id: string }>(
    `INSERT INTO source_documents
      (workspace_id,uploaded_by_user_id,purpose,original_name,declared_media_type,detected_media_type,byte_size,content_hash,storage_key,status,extracted_text,parser_version,processed_at)
     VALUES ($1,$2,'career_evidence',$3,'text/plain','text/plain',$4,$5,$6,'ready',$7,'plain-text@1',now()) RETURNING id`,
    [
      principal.workspaceId,
      principal.userId,
      `${label}.txt`,
      Buffer.byteLength(text),
      `sha256:${"a".repeat(63)}${label.length % 10}`,
      `${principal.workspaceId}/${crypto.randomUUID()}`,
      text,
    ],
  );
  return result.rows[0]!.id;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.4-bookworm")
    .withDatabase("vitae_extraction_test")
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
  repository = new ExtractionRepository(runtimePool);
  career = new CareerRepository(runtimePool);
  first = await createPrincipal("extraction-first");
  second = await createPrincipal("extraction-second");
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await ownerPool?.end();
  await container?.stop();
});

describe("extraction review and approval", () => {
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
          section: "Line 1",
          sourceDocumentId: sourceId,
        }),
        expect.objectContaining({
          label: "Line 3",
          section: "Line 3",
          sourceDocumentId: sourceId,
        }),
      ],
    );
    expect(await career.listEligibleFacts(first)).toEqual([]);
    await expect(repository.getBatch(second, batchId)).rejects.toBeInstanceOf(
      ExtractionNotFoundError,
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

  it("rejects candidates and requires an exact bulk confirmation count", async () => {
    const sourceId = await readySource(
      first,
      "bulk",
      "Synthetic one\nSynthetic two\nSynthetic three",
    );
    const batchId = await repository.createDeterministicBatch(first, sourceId);
    const proposals = (await repository.getBatch(first, batchId)).proposals;
    await repository.reject(first, proposals[0]!.id);
    await expect(
      repository.bulkApprove(first, [proposals[1]!.id, proposals[2]!.id], 1),
    ).rejects.toBeInstanceOf(ExtractionConflictError);
    expect(
      await repository.bulkApprove(
        first,
        [proposals[1]!.id, proposals[2]!.id],
        2,
      ),
    ).toHaveLength(2);
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
