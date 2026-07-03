import type { Pool, PoolClient } from "@/infrastructure/database/sqlite-pool";

import type { JobRequirementAnalysisMetadata } from "@/infrastructure/database/value-types";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";

import {
  requirementCategorySchema,
  requirementDecisionSchema,
  requirementPrioritySchema,
  requirementProposalSchema,
  validateRequirementSourceSpans,
  type RequirementProposal,
} from "./domain";

export class RequirementSetNotFoundError extends Error {
  public constructor() {
    super("The requirement review is unavailable.");
    this.name = "RequirementSetNotFoundError";
  }
}

export class RequirementReviewConflictError extends Error {
  public constructor() {
    super("The requirement review changed. Reload and try again.");
    this.name = "RequirementReviewConflictError";
  }
}

export interface RequirementRecord {
  id: string;
  category:
    | "required_qualification"
    | "preferred_qualification"
    | "responsibility"
    | "keyword"
    | "seniority"
    | "ambiguity";
  priority: "required" | "preferred" | "informational";
  decision: "proposed" | "accepted" | "rejected";
  requirement_text: string;
  source_start: number | null;
  source_end: number | null;
  source_text: string | null;
}

export interface RequirementSetRecord {
  id: string;
  job_posting_revision_id: string;
  parent_set_id: string | null;
  revision_number: number;
  method: "manual" | "deterministic" | "ai";
  status: "draft" | "reviewed";
  metadata: JobRequirementAnalysisMetadata;
  reviewed_at: Date | null;
  created_at: Date;
  requirements: RequirementRecord[];
}

async function audit(
  client: PoolClient,
  principal: WorkspacePrincipal,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO audit_events (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata) VALUES ($1,$2,$3,'job_requirement_set',$4,'succeeded',$5,$6::jsonb)`,
    [
      principal.workspaceId,
      principal.userId,
      action,
      targetId,
      crypto.randomUUID(),
      JSON.stringify(metadata),
    ],
  );
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

export class RequirementRepository {
  public constructor(private readonly pool: Pool) {}

  public async listForJobRevision(
    principal: WorkspacePrincipal,
    jobRevisionId: string,
  ): Promise<RequirementSetRecord[]> {
    const sets = await this.pool.query<
      Omit<RequirementSetRecord, "requirements">
    >(
      `SELECT s.id,s.job_posting_revision_id,s.parent_set_id,s.revision_number,s.method,s.status,s.metadata,s.reviewed_at,s.created_at
       FROM job_requirement_sets s
       JOIN job_posting_revisions r ON r.id=s.job_posting_revision_id AND r.workspace_id=s.workspace_id
       WHERE s.job_posting_revision_id=$1 AND s.workspace_id=$2 ORDER BY s.revision_number DESC`,
      [jobRevisionId, principal.workspaceId],
    );
    if (!sets.rows.length) return [];
    const requirements = await this.pool.query<
      RequirementRecord & { requirement_set_id: string }
    >(
      `SELECT id,requirement_set_id,category,priority,decision,requirement_text,source_start,source_end,source_text
       FROM job_requirements WHERE workspace_id=$1 AND requirement_set_id=ANY($2::uuid[]) ORDER BY created_at,id`,
      [principal.workspaceId, sets.rows.map((set) => set.id)],
    );
    return sets.rows.map((set) => ({
      ...set,
      requirements: requirements.rows.filter(
        (item) => item.requirement_set_id === set.id,
      ),
    }));
  }

  public async createDraft(
    principal: WorkspacePrincipal,
    input: {
      jobRevisionId: string;
      method: "manual" | "deterministic" | "ai";
      metadata: JobRequirementAnalysisMetadata;
      proposals: RequirementProposal[];
    },
  ): Promise<string> {
    const proposals = input.proposals.map((proposal) =>
      requirementProposalSchema.parse(proposal),
    );
    return transaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`requirement-set:${principal.workspaceId}:${input.jobRevisionId}`],
      );
      const source = await client.query<{ normalized_text: string }>(
        `SELECT normalized_text FROM job_posting_revisions WHERE id=$1 AND workspace_id=$2`,
        [input.jobRevisionId, principal.workspaceId],
      );
      if (!source.rows[0]) throw new RequirementSetNotFoundError();
      validateRequirementSourceSpans(source.rows[0].normalized_text, proposals);
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM job_requirement_sets WHERE job_posting_revision_id=$1 AND workspace_id=$2 AND status='draft'`,
        [input.jobRevisionId, principal.workspaceId],
      );
      if (existing.rows[0]) return existing.rows[0].id;
      const latest = await client.query<{ revision_number: number }>(
        `SELECT revision_number FROM job_requirement_sets WHERE job_posting_revision_id=$1 AND workspace_id=$2 ORDER BY revision_number DESC LIMIT 1`,
        [input.jobRevisionId, principal.workspaceId],
      );
      const set = await client.query<{ id: string }>(
        `INSERT INTO job_requirement_sets (workspace_id,job_posting_revision_id,revision_number,method,metadata,created_by_user_id)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING id`,
        [
          principal.workspaceId,
          input.jobRevisionId,
          (latest.rows[0]?.revision_number ?? 0) + 1,
          input.method,
          JSON.stringify(input.metadata),
          principal.userId,
        ],
      );
      const id = set.rows[0]!.id;
      for (const proposal of proposals) {
        await client.query(
          `INSERT INTO job_requirements (workspace_id,requirement_set_id,category,priority,requirement_text,source_start,source_end,source_text)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            principal.workspaceId,
            id,
            proposal.category,
            proposal.priority,
            proposal.requirementText,
            proposal.sourceStart,
            proposal.sourceEnd,
            proposal.sourceText,
          ],
        );
      }
      await audit(client, principal, "requirements.create_draft", id, {
        method: input.method,
        proposalCount: proposals.length,
      });
      return id;
    });
  }

  public async reviseRequirement(
    principal: WorkspacePrincipal,
    input: {
      setId: string;
      requirementId: string;
      category: string;
      priority: string;
      decision: string;
      requirementText: string;
    },
  ): Promise<void> {
    const category = requirementCategorySchema.parse(input.category);
    const priority = requirementPrioritySchema.parse(input.priority);
    const decision = requirementDecisionSchema.parse(input.decision);
    const requirementText =
      requirementProposalSchema.shape.requirementText.parse(
        input.requirementText,
      );
    const result = await this.pool.query(
      `UPDATE job_requirements q SET category=$4,priority=$5,decision=$6,requirement_text=$7,updated_at=now()
       FROM job_requirement_sets s
       WHERE q.id=$1 AND q.requirement_set_id=$2 AND q.workspace_id=$3 AND s.id=q.requirement_set_id AND s.workspace_id=q.workspace_id AND s.status='draft'`,
      [
        input.requirementId,
        input.setId,
        principal.workspaceId,
        category,
        priority,
        decision,
        requirementText,
      ],
    );
    if (!result.rowCount) throw new RequirementReviewConflictError();
  }

  public async addManualRequirement(
    principal: WorkspacePrincipal,
    setId: string,
    proposal: {
      category: string;
      priority: string;
      requirementText: string;
    },
  ): Promise<void> {
    const value = requirementProposalSchema.parse({
      ...proposal,
      sourceStart: null,
      sourceEnd: null,
      sourceText: null,
    });
    const result = await this.pool.query(
      `INSERT INTO job_requirements (workspace_id,requirement_set_id,category,priority,decision,requirement_text)
       SELECT $1,$2,$3,$4,'accepted',$5 FROM job_requirement_sets WHERE id=$2 AND workspace_id=$1 AND status='draft' RETURNING id`,
      [
        principal.workspaceId,
        setId,
        value.category,
        value.priority,
        value.requirementText,
      ],
    );
    if (!result.rowCount) throw new RequirementReviewConflictError();
  }

  public async finalize(
    principal: WorkspacePrincipal,
    setId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const set = await client.query(
        `SELECT id FROM job_requirement_sets WHERE id=$1 AND workspace_id=$2 AND status='draft' FOR UPDATE`,
        [setId, principal.workspaceId],
      );
      if (!set.rows[0]) throw new RequirementReviewConflictError();
      const counts = await client.query<{ proposed: string; accepted: string }>(
        `SELECT count(*) FILTER (WHERE decision='proposed')::text proposed,count(*) FILTER (WHERE decision='accepted')::text accepted FROM job_requirements WHERE requirement_set_id=$1 AND workspace_id=$2`,
        [setId, principal.workspaceId],
      );
      if (
        Number(counts.rows[0]!.proposed) > 0 ||
        Number(counts.rows[0]!.accepted) === 0
      )
        throw new RequirementReviewConflictError();
      await client.query(
        `UPDATE job_requirement_sets SET status='reviewed',reviewed_at=now() WHERE id=$1 AND workspace_id=$2`,
        [setId, principal.workspaceId],
      );
      await audit(client, principal, "requirements.finalize", setId, {
        acceptedCount: Number(counts.rows[0]!.accepted),
      });
    });
  }

  public async createCorrectionDraft(
    principal: WorkspacePrincipal,
    reviewedSetId: string,
  ): Promise<string> {
    return transaction(this.pool, async (client) => {
      const parent = await client.query<{
        job_posting_revision_id: string;
        revision_number: number;
        metadata: JobRequirementAnalysisMetadata;
      }>(
        `SELECT job_posting_revision_id,revision_number,metadata FROM job_requirement_sets WHERE id=$1 AND workspace_id=$2 AND status='reviewed'`,
        [reviewedSetId, principal.workspaceId],
      );
      if (!parent.rows[0]) throw new RequirementSetNotFoundError();
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM job_requirement_sets WHERE job_posting_revision_id=$1 AND workspace_id=$2 AND status='draft'`,
        [parent.rows[0].job_posting_revision_id, principal.workspaceId],
      );
      if (existing.rows[0]) return existing.rows[0].id;
      const latest = await client.query<{ revision_number: number }>(
        `SELECT revision_number FROM job_requirement_sets WHERE job_posting_revision_id=$1 AND workspace_id=$2 ORDER BY revision_number DESC LIMIT 1`,
        [parent.rows[0].job_posting_revision_id, principal.workspaceId],
      );
      const set = await client.query<{ id: string }>(
        `INSERT INTO job_requirement_sets (workspace_id,job_posting_revision_id,parent_set_id,revision_number,method,metadata,created_by_user_id)
         VALUES ($1,$2,$3,$4,'manual',$5::jsonb,$6) RETURNING id`,
        [
          principal.workspaceId,
          parent.rows[0].job_posting_revision_id,
          reviewedSetId,
          (latest.rows[0]?.revision_number ?? parent.rows[0].revision_number) +
            1,
          JSON.stringify({
            ...parent.rows[0].metadata,
            taskVersion: "manual-correction@1",
            warnings: [],
          }),
          principal.userId,
        ],
      );
      await client.query(
        `INSERT INTO job_requirements (workspace_id,requirement_set_id,category,priority,decision,requirement_text,source_start,source_end,source_text)
         SELECT workspace_id,$3,category,priority,'accepted',requirement_text,source_start,source_end,source_text FROM job_requirements WHERE requirement_set_id=$1 AND workspace_id=$2 AND decision='accepted'`,
        [reviewedSetId, principal.workspaceId, set.rows[0]!.id],
      );
      return set.rows[0]!.id;
    });
  }
}
