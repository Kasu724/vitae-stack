import type { Pool, PoolClient } from "@/infrastructure/database/sqlite-pool";

import { canonicalDocumentSchema } from "@/modules/documents/document-schema";
import { contentHash } from "@/modules/documents/hash";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";

import {
  analyzeAts,
  type AtsAnalysis,
  type AtsClaimInput,
  type AtsRequirementInput,
  type AtsSupportInput,
} from "./domain";

export class AtsInputNotFoundError extends Error {
  public constructor() {
    super("The current document or reviewed job analysis is unavailable.");
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

export interface AtsReportView {
  report: {
    id: string;
    document_id: string;
    document_title: string;
    document_version_id: string;
    job_id: string;
    job_title: string;
    job_company: string | null;
    ruleset_version: string;
    document_hash: string;
    job_hash: string;
    input_hash: string;
    evaluated_weight: number;
    overall_score_basis_points: number | null;
    blocker_count: number;
    created_at: Date;
  };
  categories: Array<{
    category: string;
    label: string;
    weight: number;
    earned_points: number;
    applicable_points: number;
    score_basis_points: number | null;
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

async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function audit(
  client: PoolClient,
  principal: WorkspacePrincipal,
  reportId: string,
  analysis: AtsAnalysis,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events
       (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata)
     VALUES ($1,$2,'ats.generate','ats_report',$3,'succeeded',$4,$5::jsonb)`,
    [
      principal.workspaceId,
      principal.userId,
      reportId,
      crypto.randomUUID(),
      JSON.stringify({
        rulesetVersion: analysis.rulesetVersion,
        evaluatedWeight: analysis.evaluatedWeight,
        blockerCount: analysis.blockerCount,
        findingCount: analysis.findings.length,
      }),
    ],
  );
}

export class AtsRepository {
  public constructor(private readonly pool: Pool) {}

  public async getSetup(
    principal: WorkspacePrincipal,
    documentId: string,
  ): Promise<AtsSetupData> {
    const [document, jobs] = await Promise.all([
      this.pool.query<AtsSetupData["document"]>(
        `SELECT id,title,kind FROM documents
         WHERE id=$1 AND workspace_id=$2 AND status='active' AND current_version_id IS NOT NULL`,
        [documentId, principal.workspaceId],
      ),
      this.pool.query<AtsSetupData["jobs"][number]>(
        `SELECT DISTINCT j.id,j.title,j.company
         FROM job_postings j
         JOIN job_posting_revisions revision ON revision.id=(SELECT r.id FROM job_posting_revisions r WHERE r.job_posting_id=j.id AND r.workspace_id=j.workspace_id ORDER BY r.revision_number DESC LIMIT 1)
         JOIN job_requirement_sets requirement_set ON requirement_set.id=(SELECT s.id FROM job_requirement_sets s WHERE s.job_posting_revision_id=revision.id AND s.workspace_id=j.workspace_id AND s.status='reviewed' ORDER BY s.revision_number DESC LIMIT 1)
         JOIN requirement_match_runs match_run ON match_run.id=(SELECT m.id FROM requirement_match_runs m WHERE m.requirement_set_id=requirement_set.id AND m.workspace_id=j.workspace_id ORDER BY m.revision_number DESC LIMIT 1)
         WHERE j.workspace_id=$1 AND j.status='active'
         ORDER BY j.title,j.id`,
        [principal.workspaceId],
      ),
    ]);
    if (!document.rows[0]) throw new AtsInputNotFoundError();
    return { document: document.rows[0], jobs: jobs.rows };
  }

  public async generate(
    principal: WorkspacePrincipal,
    input: { documentId: string; jobId: string },
  ): Promise<string> {
    return transaction(this.pool, async (client) => {
      const document = await client.query<{
        version_id: string;
        content: unknown;
        content_hash: string;
      }>(
        `SELECT v.id version_id,v.content,v.content_hash
         FROM documents d
         JOIN document_versions v ON v.id=d.current_version_id AND v.workspace_id=d.workspace_id
         WHERE d.id=$1 AND d.workspace_id=$2 AND d.status='active'
         `,
        [input.documentId, principal.workspaceId],
      );
      const documentRow = document.rows[0];
      if (!documentRow) throw new AtsInputNotFoundError();
      const canonicalDocument = canonicalDocumentSchema.parse(
        documentRow.content,
      );

      const job = await client.query<{
        job_id: string;
        revision_id: string;
        requirement_set_id: string;
        job_hash: string;
        match_run_id: string;
      }>(
        `SELECT j.id job_id,r.id revision_id,s.id requirement_set_id,r.content_hash job_hash,m.id match_run_id
         FROM job_postings j
         JOIN job_posting_revisions r ON r.id=(SELECT latest.id FROM job_posting_revisions latest WHERE latest.job_posting_id=j.id AND latest.workspace_id=j.workspace_id ORDER BY latest.revision_number DESC LIMIT 1)
         JOIN job_requirement_sets s ON s.id=(SELECT latest.id FROM job_requirement_sets latest WHERE latest.job_posting_revision_id=r.id AND latest.workspace_id=j.workspace_id AND latest.status='reviewed' ORDER BY latest.revision_number DESC LIMIT 1)
         JOIN requirement_match_runs m ON m.id=(SELECT latest.id FROM requirement_match_runs latest WHERE latest.requirement_set_id=s.id AND latest.workspace_id=j.workspace_id ORDER BY latest.revision_number DESC LIMIT 1)
         WHERE j.id=$1 AND j.workspace_id=$2 AND j.status='active'`,
        [input.jobId, principal.workspaceId],
      );
      const jobRow = job.rows[0];
      if (!jobRow) throw new AtsInputNotFoundError();

      const requirementResult = await client.query<{
        id: string;
        requirement_text: string;
        category: string;
        priority: string;
      }>(
        `SELECT id,requirement_text,category,priority FROM job_requirements
         WHERE requirement_set_id=$1 AND workspace_id=$2 AND decision='accepted'
         ORDER BY id`,
        [jobRow.requirement_set_id, principal.workspaceId],
      );
      const claimResult = await client.query<{
        id: string;
        stable_block_id: string;
        start_offset: number;
        end_offset: number;
        status: "supported" | "unverified" | "nonfactual";
      }>(
        `SELECT id,stable_block_id,start_offset,end_offset,status
         FROM generated_claims WHERE version_id=$1 AND workspace_id=$2 ORDER BY id`,
        [documentRow.version_id, principal.workspaceId],
      );
      const claimEvidenceResult = await client.query<{
        claim_id: string;
        evidence_fact_id: string;
        status: string;
      }>(
        `SELECT ce.claim_id,ce.evidence_fact_id,
                CASE WHEN f.status='approved' AND e.status='active' THEN 'approved' ELSE 'ineligible' END status
         FROM claim_evidence ce
         JOIN generated_claims c ON c.id=ce.claim_id AND c.workspace_id=ce.workspace_id
         JOIN evidence_facts f ON f.id=ce.evidence_fact_id AND f.workspace_id=ce.workspace_id
         JOIN career_entries e ON e.id=f.career_entry_id AND e.workspace_id=f.workspace_id
         WHERE c.version_id=$1 AND ce.workspace_id=$2
         ORDER BY ce.claim_id,ce.evidence_fact_id`,
        [documentRow.version_id, principal.workspaceId],
      );
      const supportResult = await client.query<{
        requirement_id: string;
        evidence_fact_id: string;
        strength: "direct" | "combined" | "weak";
      }>(
        `SELECT m.requirement_id,m.evidence_fact_id,m.strength
         FROM requirement_evidence_matches m
         JOIN requirement_evidence_decisions decision ON decision.id=(SELECT latest.id FROM requirement_evidence_decisions latest WHERE latest.match_id=m.id AND latest.workspace_id=m.workspace_id ORDER BY latest.revision_number DESC LIMIT 1) AND decision.decision='included'
         WHERE m.match_run_id=$1 AND m.workspace_id=$2
         ORDER BY m.requirement_id,m.evidence_fact_id`,
        [jobRow.match_run_id, principal.workspaceId],
      );

      const requirements: AtsRequirementInput[] = requirementResult.rows.map(
        (row) => ({
          id: row.id,
          text: row.requirement_text,
          category: row.category,
          priority: row.priority,
        }),
      );
      const evidenceByClaim = new Map<
        string,
        Array<{ id: string; status: string }>
      >();
      for (const row of claimEvidenceResult.rows) {
        const evidence = evidenceByClaim.get(row.claim_id) ?? [];
        evidence.push({ id: row.evidence_fact_id, status: row.status });
        evidenceByClaim.set(row.claim_id, evidence);
      }
      const claims: AtsClaimInput[] = claimResult.rows.map((row) => ({
        id: row.id,
        blockId: row.stable_block_id,
        start: row.start_offset,
        end: row.end_offset,
        status: row.status,
        evidence: evidenceByClaim.get(row.id) ?? [],
      }));
      const support: AtsSupportInput[] = supportResult.rows.map((row) => ({
        requirementId: row.requirement_id,
        evidenceFactId: row.evidence_fact_id,
        strength: row.strength,
      }));
      const analysis = analyzeAts({
        document: canonicalDocument,
        requirements,
        claims,
        support,
      });
      const inputHash = contentHash({
        rulesetVersion: analysis.rulesetVersion,
        documentHash: documentRow.content_hash,
        jobHash: jobRow.job_hash,
        requirements,
        claims,
        support,
      });
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`ats:${principal.workspaceId}:${inputHash}`],
      );
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM ats_reports WHERE workspace_id=$1 AND input_hash=$2`,
        [principal.workspaceId, inputHash],
      );
      if (existing.rows[0]) return existing.rows[0].id;

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO ats_reports
           (workspace_id,document_version_id,job_posting_revision_id,requirement_set_id,ruleset_version,document_hash,job_hash,input_hash,evaluated_weight,overall_score_basis_points,blocker_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          principal.workspaceId,
          documentRow.version_id,
          jobRow.revision_id,
          jobRow.requirement_set_id,
          analysis.rulesetVersion,
          documentRow.content_hash,
          jobRow.job_hash,
          inputHash,
          analysis.evaluatedWeight,
          analysis.overallScoreBasisPoints,
          analysis.blockerCount,
        ],
      );
      const reportId = inserted.rows[0]!.id;
      for (const category of analysis.categories)
        await client.query(
          `INSERT INTO ats_category_scores
             (workspace_id,report_id,category,label,weight,earned_points,applicable_points,score_basis_points)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            principal.workspaceId,
            reportId,
            category.category,
            category.label,
            category.weight,
            category.earnedPoints,
            category.applicablePoints,
            category.scoreBasisPoints,
          ],
        );
      for (const [sequence, item] of analysis.findings.entries())
        await client.query(
          `INSERT INTO ats_findings
             (workspace_id,report_id,sequence,rule_id,category,severity,location,measured,threshold,message,remediation,point_loss_basis_points,blocker)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13)`,
          [
            principal.workspaceId,
            reportId,
            sequence,
            item.ruleId,
            item.category,
            item.severity,
            JSON.stringify(item.location),
            JSON.stringify(item.measured),
            JSON.stringify(item.threshold),
            item.message,
            item.remediation,
            item.pointLossBasisPoints,
            item.blocker,
          ],
        );
      await audit(client, principal, reportId, analysis);
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
                r.evaluated_weight,r.overall_score_basis_points,r.blocker_count,r.created_at
         FROM ats_reports r
         JOIN document_versions v ON v.id=r.document_version_id AND v.workspace_id=r.workspace_id
         JOIN documents d ON d.id=v.document_id AND d.workspace_id=v.workspace_id
         JOIN job_posting_revisions jr ON jr.id=r.job_posting_revision_id AND jr.workspace_id=r.workspace_id
         JOIN job_postings j ON j.id=jr.job_posting_id AND j.workspace_id=jr.workspace_id
         WHERE r.id=$1 AND r.workspace_id=$2`,
        [reportId, principal.workspaceId],
      ),
      this.pool.query<AtsReportView["categories"][number]>(
        `SELECT category,label,weight,earned_points,applicable_points,score_basis_points
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
}
