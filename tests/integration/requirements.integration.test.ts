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
import { JobRepository } from "@/modules/jobs/repository";
import { RequirementRepository } from "@/modules/requirements/repository";
import { RequirementAnalysisService } from "@/modules/requirements/service";

let container: StartedPostgreSqlContainer;
let ownerPool: Pool;
let runtimePool: Pool;
let jobs: JobRepository;
let requirements: RequirementRepository;
let service: RequirementAnalysisService;
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
});
