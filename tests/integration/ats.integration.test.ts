// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Pool } from "@/infrastructure/database/sqlite-pool";
import { AtsInputNotFoundError, AtsRepository } from "@/modules/ats/repository";
import {
  ATS_AI_TASK_VERSION,
  hashAtsAiValue,
  type AtsAiOutput,
} from "@/modules/ats/domain";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { DocumentRepository } from "@/modules/documents/repository";
import { JobRepository } from "@/modules/jobs/repository";
import { RequirementRepository } from "@/modules/requirements/repository";
import { RequirementAnalysisService } from "@/modules/requirements/service";
import {
  ProviderConfigurationInUseError,
  ProviderConfigurationRepository,
} from "@/modules/providers/repository";
import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../helpers/sqlite-test-database";

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

const analysis: AtsAiOutput = {
  schemaVersion: ATS_AI_TASK_VERSION,
  summary: "AI summary based on supplied text.",
  overallScore: 76,
  overallRationale: "The resume is readable and specific.",
  categories: ["parsing", "formatting", "readability", "content", "impact"].map(
    (key) => ({
      key: key as
        "parsing" | "formatting" | "readability" | "content" | "impact",
      label: key,
      score: 76,
      weight: 20,
      rationale: `AI rationale for ${key}.`,
    }),
  ),
  findings: [
    {
      category: "readability" as const,
      severity: "low" as const,
      location: "Experience",
      message: "A bullet is dense.",
      remediation: "Shorten it without adding facts.",
    },
  ],
};

beforeAll(async () => {
  testDatabase = await createSqliteTestDatabase("ats-ai");
  runtimePool = testDatabase.pool;
  first = await principal("ats-first");
  second = await principal("ats-second");
}, 120_000);

afterAll(async () => {
  await testDatabase?.cleanup();
});

describe("persisted AI ATS reports", () => {
  it("persists a provider-attributed source analysis without a job source", async () => {
    const sourceId = "90000000-0000-4000-8000-000000000001";
    const providerId = "80000000-0000-4000-8000-000000000001";
    const sourceHash = `sha256:${"a".repeat(64)}`;
    await runtimePool.query(
      `INSERT INTO model_provider_configurations
       (id,workspace_id,created_by_user_id,kind,label,base_url,auth_type,capabilities,task_assignments,status,last_tested_at)
       VALUES ($1,$2,$3,'ollama','Local test model','http://127.0.0.1:11434','none',$4::jsonb,$5::jsonb,'available',now())`,
      [
        providerId,
        first.workspaceId,
        first.userId,
        JSON.stringify({ schemaVersion: 1, structuredOutput: true }),
        JSON.stringify({ "AI-11": "local-model" }),
      ],
    );
    await runtimePool.query(
      `INSERT INTO source_documents
       (id,workspace_id,uploaded_by_user_id,purpose,original_name,declared_media_type,detected_media_type,byte_size,content_hash,storage_key,status,extracted_text,parser_version,processed_at)
       VALUES ($1,$2,$3,'resume','resume.txt','text/plain','text/plain',80,$4,$5,'ready',$6,'text@1',now())`,
      [
        sourceId,
        first.workspaceId,
        first.userId,
        sourceHash,
        `${first.workspaceId}/${sourceId}.bin`,
        "Alex Example\nalex@example.test\nExperience\nBuilt systems",
      ],
    );
    const repository = new AtsRepository(runtimePool);
    const input = await repository.getSourceAnalysisInput(first, sourceId, "");
    const inputHash = hashAtsAiValue({ sourceHash, model: "local-model" });
    const reportId = await repository.saveAiReport(first, {
      analysisInput: input,
      providerConfigurationId: providerId,
      model: "local-model",
      taskVersion: ATS_AI_TASK_VERSION,
      attempts: 1,
      inputHash,
      outputHash: hashAtsAiValue(analysis),
      analysis,
    });
    expect(await repository.findExistingReport(first, input, inputHash)).toBe(
      reportId,
    );
    const report = await repository.getSourceReport(first, reportId);
    expect(report.report).toMatchObject({
      source_document_id: sourceId,
      document_hash: sourceHash,
      model: "local-model",
      task_version: ATS_AI_TASK_VERSION,
      analysis_summary: analysis.summary,
      overall_score_basis_points: 7600,
    });
    expect(report.categories).toHaveLength(5);
    expect(report.categories[0]?.rationale).toContain("AI rationale");
    expect(report.findings[0]).toMatchObject({
      rule_id: "AI-FINDING-001",
      blocker: false,
    });
    const provider = (
      await new ProviderConfigurationRepository(runtimePool).list(first)
    ).find((item) => item.id === providerId)!;
    expect(provider.ats_report_count).toBe(1);
    await expect(
      new ProviderConfigurationRepository(runtimePool).delete(
        first,
        providerId,
        provider.revision,
      ),
    ).rejects.toBeInstanceOf(ProviderConfigurationInUseError);
    await expect(
      repository.getSourceReport(second, reportId),
    ).rejects.toBeInstanceOf(AtsInputNotFoundError);
  });

  it("accepts an optional reviewed job source for a saved resume", async () => {
    const documents = new DocumentRepository(runtimePool);
    const documentId = await documents.create(first, {
      kind: "resume",
      title: "AI ATS resume",
    });
    const jobs = new JobRepository(runtimePool);
    const jobId = await jobs.createFromText(first, {
      title: "Systems role",
      company: "Example Company",
      text: "Requirements:\n- Build reliable TypeScript systems for local users and collaborate across product engineering teams.",
    });
    const job = await jobs.get(first, jobId);
    const requirements = new RequirementRepository(runtimePool);
    const setId = await new RequirementAnalysisService(
      requirements,
    ).createDeterministicDraft(
      first,
      job.revisions[0]!.id,
      job.revisions[0]!.normalized_text,
    );
    const draft = (
      await requirements.listForJobRevision(first, job.revisions[0]!.id)
    )[0]!;
    for (const requirement of draft.requirements)
      await requirements.reviseRequirement(first, {
        setId,
        requirementId: requirement.id,
        category: "required_qualification",
        priority: "required",
        decision: "accepted",
        requirementText: requirement.requirement_text,
      });
    await requirements.finalize(first, setId);

    const repository = new AtsRepository(runtimePool);
    const input = await repository.getDocumentAnalysisInput(
      first,
      documentId,
      jobId,
    );
    expect(input.job).toMatchObject({ id: jobId, title: "Systems role" });
    expect(input.resumeText).toContain("Experience");
  });
});
