import {
  type Pool,
  type PoolClient,
  withTransaction as transaction,
} from "@/infrastructure/database/sqlite-pool";

import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { canonicalDocumentSchema } from "@/modules/documents/document-schema";
import { contentHash } from "@/modules/documents/hash";

import type { AtsAiOutput } from "./domain";

export class AtsInputNotFoundError extends Error {
  public constructor() {
    super("The current resume or optional job source is unavailable.");
    this.name = "AtsInputNotFoundError";
  }
}

export interface AtsSetupData {
  document: {
    id: string;
    title: string;
    kind: "resume" | "cover_letter";
  };
  jobs: Array<{ id: string; title: string; company: string | null }>;
}

export interface SourceAtsSetupData {
  source: { id: string; original_name: string };
  jobs: AtsSetupData["jobs"];
}

interface AtsJobInput {
  id: string;
  revisionId: string;
  requirementSetId: string;
  title: string;
  company: string | null;
  text: string;
  hash: string;
}

export type AtsAnalysisInput =
  | {
      kind: "document";
      documentId: string;
      documentVersionId: string;
      resumeText: string;
      resumeHash: string;
      job: AtsJobInput | null;
    }
  | {
      kind: "source";
      sourceId: string;
      resumeText: string;
      resumeHash: string;
      job: AtsJobInput | null;
    };

interface ReportRecord {
  id: string;
  job_id: string | null;
  job_title: string | null;
  job_company: string | null;
  ruleset_version: string;
  document_hash: string;
  job_hash: string | null;
  input_hash: string;
  evaluated_weight: number;
  overall_score_basis_points: number | null;
  blocker_count: number;
  analysis_summary: string | null;
  overall_rationale: string | null;
  provider_configuration_id: string | null;
  provider_label: string | null;
  model: string | null;
  task_version: string | null;
  attempts: number | null;
  output_hash: string | null;
  created_at: Date;
}

export interface AtsReportView {
  report: ReportRecord & {
    document_id: string;
    document_title: string;
    document_version_id: string;
  };
  categories: Array<{
    category: string;
    label: string;
    weight: number;
    earned_points: number;
    applicable_points: number;
    score_basis_points: number | null;
    rationale: string | null;
  }>;
  findings: Array<{
    id: string;
    sequence: number;
    rule_id: string;
    category: string;
    severity: string;
    location: Record<string, unknown>;
    measured: Record<string, unknown>;
    threshold: Record<string, unknown>;
    message: string;
    remediation: string;
    point_loss_basis_points: number;
    blocker: boolean;
  }>;
}

export interface SourceAtsReportView {
  report: ReportRecord & {
    source_document_id: string;
    source_name: string;
  };
  categories: AtsReportView["categories"];
  findings: AtsReportView["findings"];
}

function canonicalText(content: unknown): string {
  const document = canonicalDocumentSchema.parse(content);
  return document.sections
    .flatMap((section) => [
      section.heading ?? section.type,
      ...section.blocks.map((block) => block.text),
    ])
    .filter(Boolean)
    .join("\n");
}

async function jobInput(
  client: Pick<Pool, "query"> | Pick<PoolClient, "query">,
  principal: WorkspacePrincipal,
  jobId: string,
): Promise<AtsJobInput | null> {
  if (!jobId) return null;
  const result = await client.query<{
    id: string;
    revision_id: string;
    requirement_set_id: string;
    title: string;
    company: string | null;
    normalized_text: string;
    content_hash: string;
  }>(
    `SELECT j.id,r.id revision_id,s.id requirement_set_id,j.title,j.company,
            r.normalized_text,r.content_hash
     FROM job_postings j
     JOIN job_posting_revisions r ON r.id=(SELECT latest.id FROM job_posting_revisions latest WHERE latest.job_posting_id=j.id AND latest.workspace_id=j.workspace_id ORDER BY latest.revision_number DESC LIMIT 1)
     JOIN job_requirement_sets s ON s.id=(SELECT latest.id FROM job_requirement_sets latest WHERE latest.job_posting_revision_id=r.id AND latest.workspace_id=j.workspace_id AND latest.status='reviewed' ORDER BY latest.revision_number DESC LIMIT 1)
     WHERE j.id=$1 AND j.workspace_id=$2 AND j.status='active'`,
    [jobId, principal.workspaceId],
  );
  const row = result.rows[0];
  if (!row) throw new AtsInputNotFoundError();
  return {
    id: row.id,
    revisionId: row.revision_id,
    requirementSetId: row.requirement_set_id,
    title: row.title,
    company: row.company,
    text: row.normalized_text,
    hash: row.content_hash,
  };
}

async function audit(
  client: PoolClient,
  principal: WorkspacePrincipal,
  reportId: string,
  input: {
    taskVersion: string;
    providerConfigurationId: string;
    model: string;
    attempts: number;
    categoryCount: number;
    findingCount: number;
    hasJob: boolean;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events
       (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata)
     VALUES ($1,$2,'ats.ai.generate','ats_report',$3,'succeeded',$4,$5::jsonb)`,
    [
      principal.workspaceId,
      principal.userId,
      reportId,
      crypto.randomUUID(),
      JSON.stringify(input),
    ],
  );
}

export class AtsRepository {
  public constructor(private readonly pool: Pool) {}

  private async eligibleJobs(
    principal: WorkspacePrincipal,
  ): Promise<AtsSetupData["jobs"]> {
    const jobs = await this.pool.query<AtsSetupData["jobs"][number]>(
      `SELECT DISTINCT j.id,j.title,j.company
       FROM job_postings j
       JOIN job_posting_revisions revision ON revision.id=(SELECT r.id FROM job_posting_revisions r WHERE r.job_posting_id=j.id AND r.workspace_id=j.workspace_id ORDER BY r.revision_number DESC LIMIT 1)
       JOIN job_requirement_sets requirement_set ON requirement_set.id=(SELECT s.id FROM job_requirement_sets s WHERE s.job_posting_revision_id=revision.id AND s.workspace_id=j.workspace_id AND s.status='reviewed' ORDER BY s.revision_number DESC LIMIT 1)
       WHERE j.workspace_id=$1 AND j.status='active'
       ORDER BY j.title,j.id`,
      [principal.workspaceId],
    );
    return jobs.rows;
  }

  public async getSetup(
    principal: WorkspacePrincipal,
    documentId: string,
  ): Promise<AtsSetupData> {
    const [document, jobs] = await Promise.all([
      this.pool.query<AtsSetupData["document"]>(
        `SELECT id,title,kind FROM documents
         WHERE id=$1 AND workspace_id=$2 AND status='active' AND current_version_id IS NOT NULL AND kind='resume'`,
        [documentId, principal.workspaceId],
      ),
      this.eligibleJobs(principal),
    ]);
    if (!document.rows[0]) throw new AtsInputNotFoundError();
    return { document: document.rows[0], jobs };
  }

  public async getSourceSetup(
    principal: WorkspacePrincipal,
    sourceId: string,
  ): Promise<SourceAtsSetupData> {
    const [source, jobs] = await Promise.all([
      this.pool.query<SourceAtsSetupData["source"]>(
        `SELECT id,original_name FROM source_documents
         WHERE id=$1 AND workspace_id=$2 AND status='ready' AND purpose='resume' AND extracted_text IS NOT NULL`,
        [sourceId, principal.workspaceId],
      ),
      this.eligibleJobs(principal),
    ]);
    if (!source.rows[0]) throw new AtsInputNotFoundError();
    return { source: source.rows[0], jobs };
  }

  public async getDocumentAnalysisInput(
    principal: WorkspacePrincipal,
    documentId: string,
    jobId: string,
  ): Promise<AtsAnalysisInput> {
    const document = await this.pool.query<{
      version_id: string;
      content: unknown;
      content_hash: string;
    }>(
      `SELECT v.id version_id,v.content,v.content_hash
       FROM documents d
       JOIN document_versions v ON v.id=d.current_version_id AND v.workspace_id=d.workspace_id
       WHERE d.id=$1 AND d.workspace_id=$2 AND d.status='active' AND d.kind='resume'`,
      [documentId, principal.workspaceId],
    );
    const row = document.rows[0];
    if (!row) throw new AtsInputNotFoundError();
    const parsed = canonicalDocumentSchema.parse(row.content);
    if (contentHash(parsed) !== row.content_hash)
      throw new AtsInputNotFoundError();
    return {
      kind: "document",
      documentId,
      documentVersionId: row.version_id,
      resumeText: canonicalText(parsed),
      resumeHash: row.content_hash,
      job: await jobInput(this.pool, principal, jobId),
    };
  }

  public async getSourceAnalysisInput(
    principal: WorkspacePrincipal,
    sourceId: string,
    jobId: string,
  ): Promise<AtsAnalysisInput> {
    const source = await this.pool.query<{
      extracted_text: string;
      content_hash: string;
    }>(
      `SELECT extracted_text,content_hash FROM source_documents
       WHERE id=$1 AND workspace_id=$2 AND status='ready' AND purpose='resume' AND extracted_text IS NOT NULL`,
      [sourceId, principal.workspaceId],
    );
    const row = source.rows[0];
    if (!row) throw new AtsInputNotFoundError();
    return {
      kind: "source",
      sourceId,
      resumeText: row.extracted_text,
      resumeHash: row.content_hash,
      job: await jobInput(this.pool, principal, jobId),
    };
  }

  public async findExistingReport(
    principal: WorkspacePrincipal,
    input: AtsAnalysisInput,
    inputHash: string,
  ): Promise<string | null> {
    const table =
      input.kind === "source" ? "source_ats_reports" : "ats_reports";
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM ${table} WHERE workspace_id=$1 AND input_hash=$2`,
      [principal.workspaceId, inputHash],
    );
    return result.rows[0]?.id ?? null;
  }

  public async saveAiReport(
    principal: WorkspacePrincipal,
    input: {
      analysisInput: AtsAnalysisInput;
      providerConfigurationId: string;
      model: string;
      taskVersion: string;
      attempts: number;
      inputHash: string;
      outputHash: string;
      analysis: AtsAiOutput;
    },
  ): Promise<string> {
    return transaction(this.pool, async (client) => {
      const context = input.analysisInput;
      const provider = await client.query<{ model: string | null }>(
        `SELECT json_extract(task_assignments,'$.AI-11') model
         FROM model_provider_configurations
         WHERE id=$1 AND workspace_id=$2 AND status='available'
           AND json_extract(capabilities,'$.structuredOutput')=1`,
        [input.providerConfigurationId, principal.workspaceId],
      );
      if (provider.rows[0]?.model !== input.model)
        throw new AtsInputNotFoundError();
      const current =
        context.kind === "source"
          ? await client.query(
              `SELECT 1 FROM source_documents WHERE id=$1 AND workspace_id=$2 AND status='ready' AND purpose='resume' AND content_hash=$3`,
              [context.sourceId, principal.workspaceId, context.resumeHash],
            )
          : await client.query(
              `SELECT 1 FROM documents d JOIN document_versions v ON v.id=d.current_version_id AND v.workspace_id=d.workspace_id WHERE d.id=$1 AND d.workspace_id=$2 AND d.status='active' AND d.kind='resume' AND v.id=$3 AND v.content_hash=$4`,
              [
                context.documentId,
                principal.workspaceId,
                context.documentVersionId,
                context.resumeHash,
              ],
            );
      if (!current.rows[0]) throw new AtsInputNotFoundError();
      if (context.job) {
        const currentJob = await jobInput(client, principal, context.job.id);
        if (
          !currentJob ||
          currentJob.revisionId !== context.job.revisionId ||
          currentJob.requirementSetId !== context.job.requirementSetId ||
          currentJob.hash !== context.job.hash
        )
          throw new AtsInputNotFoundError();
      }
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`ats-ai:${principal.workspaceId}:${input.inputHash}`],
      );
      const table =
        context.kind === "source" ? "source_ats_reports" : "ats_reports";
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM ${table} WHERE workspace_id=$1 AND input_hash=$2`,
        [principal.workspaceId, input.inputHash],
      );
      if (existing.rows[0]) return existing.rows[0].id;

      const common = [
        principal.workspaceId,
        context.job?.revisionId ?? null,
        context.job?.requirementSetId ?? null,
        input.taskVersion,
        context.resumeHash,
        context.job?.hash ?? null,
        input.inputHash,
        100,
        input.analysis.overallScore * 100,
        0,
        input.analysis.summary,
        input.analysis.overallRationale,
        input.providerConfigurationId,
        input.model,
        input.taskVersion,
        input.attempts,
        input.outputHash,
      ];
      const inserted =
        context.kind === "source"
          ? await client.query<{ id: string }>(
              `INSERT INTO source_ats_reports
               (workspace_id,source_document_id,job_posting_revision_id,requirement_set_id,ruleset_version,document_hash,job_hash,input_hash,evaluated_weight,overall_score_basis_points,blocker_count,analysis_summary,overall_rationale,provider_configuration_id,model,task_version,attempts,output_hash)
               VALUES ($1,$18,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
              [...common, context.sourceId],
            )
          : await client.query<{ id: string }>(
              `INSERT INTO ats_reports
               (workspace_id,document_version_id,job_posting_revision_id,requirement_set_id,ruleset_version,document_hash,job_hash,input_hash,evaluated_weight,overall_score_basis_points,blocker_count,analysis_summary,overall_rationale,provider_configuration_id,model,task_version,attempts,output_hash)
               VALUES ($1,$18,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
              [...common, context.documentVersionId],
            );
      const reportId = inserted.rows[0]!.id;
      const categoryTable =
        context.kind === "source"
          ? "source_ats_category_scores"
          : "ats_category_scores";
      const findingTable =
        context.kind === "source" ? "source_ats_findings" : "ats_findings";
      for (const category of input.analysis.categories)
        await client.query(
          `INSERT INTO ${categoryTable}
           (workspace_id,report_id,category,label,weight,earned_points,applicable_points,score_basis_points,rationale)
           VALUES ($1,$2,$3,$4,$5,$6,100,$7,$8)`,
          [
            principal.workspaceId,
            reportId,
            category.key,
            category.label,
            category.weight,
            category.score,
            category.score * 100,
            category.rationale,
          ],
        );
      for (const [sequence, finding] of input.analysis.findings.entries())
        await client.query(
          `INSERT INTO ${findingTable}
           (workspace_id,report_id,sequence,rule_id,category,severity,location,measured,threshold,message,remediation,point_loss_basis_points,blocker)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'{}'::jsonb,'{}'::jsonb,$8,$9,0,0)`,
          [
            principal.workspaceId,
            reportId,
            sequence,
            `AI-FINDING-${String(sequence + 1).padStart(3, "0")}`,
            finding.category,
            finding.severity,
            JSON.stringify({ hint: finding.location }),
            finding.message,
            finding.remediation,
          ],
        );
      await audit(client, principal, reportId, {
        taskVersion: input.taskVersion,
        providerConfigurationId: input.providerConfigurationId,
        model: input.model,
        attempts: input.attempts,
        categoryCount: input.analysis.categories.length,
        findingCount: input.analysis.findings.length,
        hasJob: Boolean(context.job),
      });
      return reportId;
    });
  }

  public async getReport(
    principal: WorkspacePrincipal,
    reportId: string,
  ): Promise<AtsReportView> {
    const [report, categories, findings] = await Promise.all([
      this.pool.query<AtsReportView["report"]>(
        `SELECT r.id,d.id document_id,d.title document_title,r.document_version_id,
                j.id job_id,j.title job_title,j.company job_company,
                r.ruleset_version,r.document_hash,r.job_hash,r.input_hash,
                r.evaluated_weight,r.overall_score_basis_points,r.blocker_count,
                r.analysis_summary,r.overall_rationale,r.provider_configuration_id,
                p.label provider_label,r.model,r.task_version,r.attempts,r.output_hash,r.created_at
         FROM ats_reports r
         JOIN document_versions v ON v.id=r.document_version_id AND v.workspace_id=r.workspace_id
         JOIN documents d ON d.id=v.document_id AND d.workspace_id=v.workspace_id
         LEFT JOIN job_posting_revisions jr ON jr.id=r.job_posting_revision_id AND jr.workspace_id=r.workspace_id
         LEFT JOIN job_postings j ON j.id=jr.job_posting_id AND j.workspace_id=jr.workspace_id
         LEFT JOIN model_provider_configurations p ON p.id=r.provider_configuration_id AND p.workspace_id=r.workspace_id
         WHERE r.id=$1 AND r.workspace_id=$2`,
        [reportId, principal.workspaceId],
      ),
      this.pool.query<AtsReportView["categories"][number]>(
        `SELECT category,label,weight,earned_points,applicable_points,score_basis_points,rationale
         FROM ats_category_scores WHERE report_id=$1 AND workspace_id=$2 ORDER BY weight DESC,category`,
        [reportId, principal.workspaceId],
      ),
      this.pool.query<AtsReportView["findings"][number]>(
        `SELECT id,sequence,rule_id,category,severity,location,measured,threshold,message,remediation,point_loss_basis_points,blocker
         FROM ats_findings WHERE report_id=$1 AND workspace_id=$2 ORDER BY sequence`,
        [reportId, principal.workspaceId],
      ),
    ]);
    if (!report.rows[0]) throw new AtsInputNotFoundError();
    return {
      report: report.rows[0],
      categories: categories.rows,
      findings: findings.rows,
    };
  }

  public async getSourceReport(
    principal: WorkspacePrincipal,
    reportId: string,
  ): Promise<SourceAtsReportView> {
    const [report, categories, findings] = await Promise.all([
      this.pool.query<SourceAtsReportView["report"]>(
        `SELECT r.id,r.source_document_id,s.original_name source_name,
                j.id job_id,j.title job_title,j.company job_company,
                r.ruleset_version,r.document_hash,r.job_hash,r.input_hash,
                r.evaluated_weight,r.overall_score_basis_points,r.blocker_count,
                r.analysis_summary,r.overall_rationale,r.provider_configuration_id,
                p.label provider_label,r.model,r.task_version,r.attempts,r.output_hash,r.created_at
         FROM source_ats_reports r
         JOIN source_documents s ON s.id=r.source_document_id AND s.workspace_id=r.workspace_id
         LEFT JOIN job_posting_revisions jr ON jr.id=r.job_posting_revision_id AND jr.workspace_id=r.workspace_id
         LEFT JOIN job_postings j ON j.id=jr.job_posting_id AND j.workspace_id=jr.workspace_id
         LEFT JOIN model_provider_configurations p ON p.id=r.provider_configuration_id AND p.workspace_id=r.workspace_id
         WHERE r.id=$1 AND r.workspace_id=$2`,
        [reportId, principal.workspaceId],
      ),
      this.pool.query<AtsReportView["categories"][number]>(
        `SELECT category,label,weight,earned_points,applicable_points,score_basis_points,rationale FROM source_ats_category_scores WHERE report_id=$1 AND workspace_id=$2 ORDER BY weight DESC,category`,
        [reportId, principal.workspaceId],
      ),
      this.pool.query<AtsReportView["findings"][number]>(
        `SELECT id,sequence,rule_id,category,severity,location,measured,threshold,message,remediation,point_loss_basis_points,blocker FROM source_ats_findings WHERE report_id=$1 AND workspace_id=$2 ORDER BY sequence`,
        [reportId, principal.workspaceId],
      ),
    ]);
    if (!report.rows[0]) throw new AtsInputNotFoundError();
    return {
      report: report.rows[0],
      categories: categories.rows,
      findings: findings.rows,
    };
  }
}
