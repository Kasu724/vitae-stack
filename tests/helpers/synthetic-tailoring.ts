import { createDatabaseConnection } from "@/infrastructure/database/connection";
import { AtsRepository } from "@/modules/ats/repository";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { contentHash } from "@/modules/documents/hash";
import { DocumentRepository } from "@/modules/documents/repository";
import { JobRepository } from "@/modules/jobs/repository";
import { MatchingRepository } from "@/modules/matching/repository";
import { RequirementRepository } from "@/modules/requirements/repository";
import { RequirementAnalysisService } from "@/modules/requirements/service";
import { TailoringRepository } from "@/modules/tailoring/repository";

import { syntheticAuthUser } from "./synthetic-auth";

export async function seedSyntheticTailoringRun(
  options: {
    email?: string;
    includeReviewVariants?: boolean;
  } = {},
): Promise<{
  documentId: string;
  runId: string;
  coverLetterDocumentId: string;
  coverLetterRunId: string;
  atsReportId: string;
  jobId: string;
}> {
  const connection = createDatabaseConnection(
    process.env.DATABASE_PATH ?? "./var/vitae.sqlite",
    { maxConnections: 2 },
  );
  try {
    const identity = await connection.pool.query<{
      user_id: string;
      workspace_id: string;
    }>(
      `SELECT u.id user_id,m.workspace_id FROM users u JOIN workspace_memberships m ON m.user_id=u.id WHERE u.email=$1 ORDER BY m.created_at LIMIT 1`,
      [options.email ?? syntheticAuthUser.email],
    );
    if (!identity.rows[0])
      throw new Error("Synthetic browser user is missing.");
    const principal: WorkspacePrincipal = {
      authenticatedAt: new Date(),
      mode: "trusted-local",
      userId: identity.rows[0].user_id,
      workspaceId: identity.rows[0].workspace_id,
    };
    const suffix = crypto.randomUUID().slice(0, 8);
    const documents = new DocumentRepository(connection.pool);
    const documentId = await documents.create(principal, {
      kind: "resume",
      title: `Tailoring review ${suffix}`,
    });
    const initial = await documents.get(principal, documentId);
    const content = structuredClone(initial.currentVersion.content);
    const section = content.sections.find(
      (item) => item.type === "experience",
    )!;
    const block = section.blocks[0]!;
    block.text = "Built synthetic systems";
    await documents.commitVersion(principal, {
      documentId,
      baseVersionId: initial.currentVersion.id,
      content,
    });
    const entry = await connection.pool.query<{ id: string }>(
      `INSERT INTO career_entries (workspace_id,career_profile_id,type,title,description)
       SELECT $1,id,'project',$2,'Synthetic browser evidence' FROM career_profiles WHERE workspace_id=$1 RETURNING id`,
      [principal.workspaceId, `Tailoring project ${suffix}`],
    );
    const fact = await connection.pool.query<{ id: string }>(
      `INSERT INTO evidence_facts (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
       VALUES ($1,$2,'statement',$3::jsonb,'Built synthetic systems',$4::jsonb,$5) RETURNING id`,
      [
        principal.workspaceId,
        entry.rows[0]!.id,
        JSON.stringify({ kind: "text", text: "Built synthetic systems" }),
        JSON.stringify({ kind: "manual", label: "Synthetic browser fixture" }),
        principal.userId,
      ],
    );
    const jobs = new JobRepository(connection.pool);
    const jobId = await jobs.createFromText(principal, {
      title: `Grounded browser role ${suffix}`,
      company: "Example Company",
      text: "Requirements:\n- Build synthetic systems",
    });
    const revision = (await jobs.get(principal, jobId)).revisions[0]!;
    const requirements = new RequirementRepository(connection.pool);
    const setId = await new RequirementAnalysisService(
      requirements,
    ).createDeterministicDraft(
      principal,
      revision.id,
      revision.normalized_text,
    );
    const draft = (
      await requirements.listForJobRevision(principal, revision.id)
    )[0]!;
    for (const requirement of draft.requirements)
      await requirements.reviseRequirement(principal, {
        setId,
        requirementId: requirement.id,
        category: requirement.category,
        priority: requirement.priority,
        decision: "accepted",
        requirementText: requirement.requirement_text,
      });
    await requirements.finalize(principal, setId);
    const matching = new MatchingRepository(connection.pool);
    await matching.generate(principal, setId);
    const matrix = (await matching.getLatestMatrix(principal, setId))!;
    const matchedRequirement = matrix.requirements.find((item) =>
      item.candidates.some(
        (candidate) => candidate.evidence_fact_id === fact.rows[0]!.id,
      ),
    )!;
    const candidate = matchedRequirement.candidates.find(
      (item) => item.evidence_fact_id === fact.rows[0]!.id,
    )!;
    await matching.decide(principal, candidate.id, "included");
    const provider = await connection.pool.query<{ id: string }>(
      `INSERT INTO model_provider_configurations (workspace_id,created_by_user_id,kind,label,base_url,auth_type,capabilities,task_assignments,status,last_tested_at)
       VALUES ($1,$2,'openai_compatible',$3,'https://provider.example.test/v1','none',$4::jsonb,$5::jsonb,'available',now()) RETURNING id`,
      [
        principal.workspaceId,
        principal.userId,
        `Synthetic browser provider ${suffix}`,
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
    const tailoring = new TailoringRepository(connection.pool);
    const prepared = await tailoring.prepareResumeRun(principal, {
      documentId,
      jobId,
      selectedEntryIds: [entry.rows[0]!.id],
      providerConfigurationId: provider.rows[0]!.id,
      tone: "direct",
      targetLength: "standard",
      idempotencyKey: `browser-${suffix}`,
    });
    const proposed = "Built synthetic systems with approved evidence";
    await tailoring.completeResumeRun(principal, prepared.runId, {
      taskResults: [],
      gaps: [],
      suggestions: [
        {
          operation: "replace_block_text",
          targetSectionId: section.id,
          targetBlockId: block.id,
          baseBlockHash: contentHash(block),
          beforeText: block.text,
          afterText: proposed,
          rationale: "Uses only selected approved evidence.",
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
        ...(options.includeReviewVariants
          ? [
              {
                operation: "replace_block_text" as const,
                targetSectionId: content.sections.find(
                  (item) => item.type === "summary",
                )!.id,
                targetBlockId: content.sections.find(
                  (item) => item.type === "summary",
                )!.blocks[0]!.id,
                baseBlockHash: contentHash(
                  content.sections.find((item) => item.type === "summary")!
                    .blocks[0]!,
                ),
                beforeText: "",
                afterText: "Built synthetic systems",
                rationale: "A review variant that may be explicitly rejected.",
                taskId: "AI-06" as const,
                taskVersion: "ai-06.v1",
                requirementIds: [matchedRequirement.id],
                claims: [
                  {
                    start: 0,
                    end: "Built synthetic systems".length,
                    relation: "direct" as const,
                    evidenceFactIds: [fact.rows[0]!.id],
                  },
                ],
              },
              {
                operation: "replace_block_text" as const,
                targetSectionId: content.sections.find(
                  (item) => item.type === "education",
                )!.id,
                targetBlockId: content.sections.find(
                  (item) => item.type === "education",
                )!.blocks[0]!.id,
                baseBlockHash: contentHash(
                  content.sections.find((item) => item.type === "education")!
                    .blocks[0]!,
                ),
                beforeText: "",
                afterText: "Built synthetic systems",
                rationale: "A review variant that may be manually edited.",
                taskId: "AI-06" as const,
                taskVersion: "ai-06.v1",
                requirementIds: [matchedRequirement.id],
                claims: [
                  {
                    start: 0,
                    end: "Built synthetic systems".length,
                    relation: "direct" as const,
                    evidenceFactIds: [fact.rows[0]!.id],
                  },
                ],
              },
            ]
          : []),
      ],
    });
    const coverLetterDocumentId = await documents.create(principal, {
      kind: "cover_letter",
      title: `Cover-letter review ${suffix}`,
    });
    const letter = await documents.get(principal, coverLetterDocumentId);
    const bodySection = letter.currentVersion.content.sections.find(
      (item) => item.type === "body",
    )!;
    const bodyBlock = bodySection.blocks[0]!;
    const coverLetterRun = await tailoring.prepareCoverLetterRun(principal, {
      documentId: coverLetterDocumentId,
      jobId,
      selectedEntryIds: [entry.rows[0]!.id],
      providerConfigurationId: provider.rows[0]!.id,
      tone: "warm",
      targetLength: "concise",
      idempotencyKey: `browser-cover-letter-${suffix}`,
    });
    await tailoring.completeResumeRun(principal, coverLetterRun.runId, {
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
          rationale: "Uses only selected approved career evidence.",
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
    const atsReportId = await new AtsRepository(connection.pool).generate(
      principal,
      { documentId, jobId },
    );
    return {
      documentId,
      runId: prepared.runId,
      coverLetterDocumentId,
      coverLetterRunId: coverLetterRun.runId,
      atsReportId,
      jobId,
    };
  } finally {
    await connection.pool.end();
  }
}
