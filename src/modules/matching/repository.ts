import type { Pool, PoolClient } from "@/infrastructure/database/sqlite-pool";

import type {
  EvidenceValue,
  SourceLocatorValue,
} from "@/infrastructure/database/value-types";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";

import {
  hashMatchInputs,
  MATCH_ALGORITHM_VERSION,
  matchEvidenceDeterministically,
  type MatchFactInput,
  type MatchRequirementInput,
} from "./domain";

export class MatchRunNotFoundError extends Error {
  public constructor() {
    super("The evidence match run is unavailable.");
    this.name = "MatchRunNotFoundError";
  }
}

export class MatchDecisionConflictError extends Error {
  public constructor() {
    super("The evidence match changed or is no longer eligible.");
    this.name = "MatchDecisionConflictError";
  }
}

interface EligibleFactRow {
  id: string;
  type: string;
  display_text: string;
  value: EvidenceValue;
}

export interface MatchCandidateRecord {
  id: string;
  evidence_fact_id: string;
  strength: "direct" | "combined" | "weak";
  score_basis_points: number;
  reason: string;
  signals: {
    schemaVersion: 1;
    matchedTokens: string[];
    requirementTokenCount: number;
    exactSkill: boolean;
    phraseMatch: boolean;
  };
  display_text: string;
  fact_type: string;
  source_locator: SourceLocatorValue;
  career_entry_id: string;
  fact_status: "approved" | "superseded" | "withdrawn";
  entry_status: "active" | "archived";
  current_decision: "included" | "excluded" | null;
  decision_revision: number | null;
}

export interface MatchMatrixRequirement {
  id: string;
  requirement_text: string;
  category: string;
  priority: string;
  candidates: MatchCandidateRecord[];
}

export interface MatchMatrix {
  run: {
    id: string;
    revision_number: number;
    algorithm_version: string;
    eligible_fact_count: number;
    created_at: Date;
  };
  requirements: MatchMatrixRequirement[];
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
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO audit_events (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata) VALUES ($1,$2,$3,'requirement_match_run',$4,'succeeded',$5,$6::jsonb)`,
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

export class MatchingRepository {
  public constructor(private readonly pool: Pool) {}

  public async generate(
    principal: WorkspacePrincipal,
    requirementSetId: string,
  ): Promise<string> {
    return transaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`matching:${principal.workspaceId}:${requirementSetId}`],
      );
      const set = await client.query<{ id: string }>(
        `SELECT id FROM job_requirement_sets WHERE id=$1 AND workspace_id=$2 AND status='reviewed'`,
        [requirementSetId, principal.workspaceId],
      );
      if (!set.rows[0]) throw new MatchRunNotFoundError();
      const requirementResult = await client.query<{
        id: string;
        requirement_text: string;
      }>(
        `SELECT id,requirement_text FROM job_requirements WHERE requirement_set_id=$1 AND workspace_id=$2 AND decision='accepted' ORDER BY created_at,id`,
        [requirementSetId, principal.workspaceId],
      );
      const factResult = await client.query<EligibleFactRow>(
        `SELECT f.id,f.type,f.value,f.display_text
         FROM evidence_facts f
         JOIN career_entries e ON e.id=f.career_entry_id AND e.workspace_id=f.workspace_id
         WHERE f.workspace_id=$1 AND f.status='approved' AND e.status='active'
         ORDER BY f.id`,
        [principal.workspaceId],
      );
      const requirements: MatchRequirementInput[] = requirementResult.rows.map(
        (row) => ({ id: row.id, text: row.requirement_text }),
      );
      const facts: MatchFactInput[] = factResult.rows.map((row) => ({
        id: row.id,
        type: row.type,
        displayText: row.display_text,
        value: row.value,
      }));
      const matches = matchEvidenceDeterministically(requirements, facts);
      const latest = await client.query<{ revision_number: number }>(
        `SELECT revision_number FROM requirement_match_runs WHERE requirement_set_id=$1 AND workspace_id=$2 ORDER BY revision_number DESC LIMIT 1`,
        [requirementSetId, principal.workspaceId],
      );
      const run = await client.query<{ id: string }>(
        `INSERT INTO requirement_match_runs (workspace_id,requirement_set_id,revision_number,algorithm_version,input_hash,eligible_fact_count,created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          principal.workspaceId,
          requirementSetId,
          (latest.rows[0]?.revision_number ?? 0) + 1,
          MATCH_ALGORITHM_VERSION,
          hashMatchInputs({ requirements, facts }),
          facts.length,
          principal.userId,
        ],
      );
      const runId = run.rows[0]!.id;
      for (const match of matches) {
        await client.query(
          `INSERT INTO requirement_evidence_matches (workspace_id,match_run_id,requirement_set_id,requirement_id,evidence_fact_id,strength,score_basis_points,algorithm_version,signals,reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
          [
            principal.workspaceId,
            runId,
            requirementSetId,
            match.requirementId,
            match.evidenceFactId,
            match.strength,
            match.scoreBasisPoints,
            MATCH_ALGORITHM_VERSION,
            JSON.stringify({
              schemaVersion: 1,
              matchedTokens: match.matchedTokens,
              requirementTokenCount: match.requirementTokenCount,
              exactSkill: match.exactSkill,
              phraseMatch: match.phraseMatch,
            }),
            match.reason,
          ],
        );
      }
      await audit(client, principal, "matching.generate", runId, {
        algorithmVersion: MATCH_ALGORITHM_VERSION,
        requirementCount: requirements.length,
        eligibleFactCount: facts.length,
        matchCount: matches.length,
      });
      return runId;
    });
  }

  public async getLatestMatrix(
    principal: WorkspacePrincipal,
    requirementSetId: string,
  ): Promise<MatchMatrix | null> {
    const run = await this.pool.query<MatchMatrix["run"]>(
      `SELECT id,revision_number,algorithm_version,eligible_fact_count,created_at
       FROM requirement_match_runs WHERE requirement_set_id=$1 AND workspace_id=$2 ORDER BY revision_number DESC LIMIT 1`,
      [requirementSetId, principal.workspaceId],
    );
    if (!run.rows[0]) return null;
    const requirements = await this.pool.query<
      Omit<MatchMatrixRequirement, "candidates">
    >(
      `SELECT id,requirement_text,category,priority FROM job_requirements WHERE requirement_set_id=$1 AND workspace_id=$2 AND decision='accepted' ORDER BY created_at,id`,
      [requirementSetId, principal.workspaceId],
    );
    const candidates = await this.pool.query<
      MatchCandidateRecord & { requirement_id: string }
    >(
      `SELECT m.id,m.requirement_id,m.evidence_fact_id,m.strength,m.score_basis_points,m.reason,m.signals,
              f.display_text,f.type fact_type,f.source_locator,f.career_entry_id,f.status fact_status,e.status entry_status,
              d.decision current_decision,d.revision_number decision_revision
       FROM requirement_evidence_matches m
       JOIN evidence_facts f ON f.id=m.evidence_fact_id AND f.workspace_id=m.workspace_id
       JOIN career_entries e ON e.id=f.career_entry_id AND e.workspace_id=f.workspace_id
       LEFT JOIN requirement_evidence_decisions d ON d.id=(
         SELECT latest.id FROM requirement_evidence_decisions latest
         WHERE latest.match_id=m.id AND latest.workspace_id=m.workspace_id
         ORDER BY latest.revision_number DESC LIMIT 1
       )
       WHERE m.match_run_id=$1 AND m.workspace_id=$2
       ORDER BY m.requirement_id,m.score_basis_points DESC,m.evidence_fact_id`,
      [run.rows[0].id, principal.workspaceId],
    );
    return {
      run: run.rows[0],
      requirements: requirements.rows.map((requirement) => ({
        ...requirement,
        candidates: candidates.rows.filter(
          (candidate) => candidate.requirement_id === requirement.id,
        ),
      })),
    };
  }

  public async decide(
    principal: WorkspacePrincipal,
    matchId: string,
    decision: "included" | "excluded",
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`match-decision:${principal.workspaceId}:${matchId}`],
      );
      const match = await client.query<{ id: string; eligible: boolean }>(
        `SELECT m.id,(f.status='approved' AND e.status='active') eligible
         FROM requirement_evidence_matches m
         JOIN evidence_facts f ON f.id=m.evidence_fact_id AND f.workspace_id=m.workspace_id
         JOIN career_entries e ON e.id=f.career_entry_id AND e.workspace_id=f.workspace_id
         WHERE m.id=$1 AND m.workspace_id=$2`,
        [matchId, principal.workspaceId],
      );
      if (
        !match.rows[0] ||
        (decision === "included" && !match.rows[0].eligible)
      )
        throw new MatchDecisionConflictError();
      const latest = await client.query<{ revision_number: number }>(
        `SELECT revision_number FROM requirement_evidence_decisions WHERE match_id=$1 AND workspace_id=$2 ORDER BY revision_number DESC LIMIT 1`,
        [matchId, principal.workspaceId],
      );
      await client.query(
        `INSERT INTO requirement_evidence_decisions (workspace_id,match_id,revision_number,decision,decided_by_user_id) VALUES ($1,$2,$3,$4,$5)`,
        [
          principal.workspaceId,
          matchId,
          (latest.rows[0]?.revision_number ?? 0) + 1,
          decision,
          principal.userId,
        ],
      );
      await audit(client, principal, "matching.decide", matchId, { decision });
    });
  }
}
