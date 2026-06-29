import type { Pool, PoolClient } from "pg";

import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";

import {
  careerEntryInputSchema,
  factProposalInputSchema,
  normalizePartialDate,
  type CareerEntryInput,
  type FactProposalInput,
} from "./domain";

export class CareerConflictError extends Error {
  public constructor() {
    super("This record changed in another session. Reload it and try again.");
    this.name = "CareerConflictError";
  }
}

export class CareerNotFoundError extends Error {
  public constructor() {
    super("The requested resource is unavailable.");
    this.name = "CareerNotFoundError";
  }
}

export interface CareerEntryRecord {
  id: string;
  type: string;
  title: string;
  organization: string | null;
  location: string | null;
  description: string | null;
  start_date: string | null;
  start_date_precision: "day" | "month" | "year" | null;
  end_date: string | null;
  end_date_precision: "day" | "month" | "year" | null;
  is_current: boolean;
  tags: string[];
  status: "active" | "archived";
  revision: number;
  approved_fact_count: number;
  pending_proposal_count: number;
  possible_duplicate: boolean;
}

export interface EvidenceFactRecord {
  id: string;
  type: string;
  value: unknown;
  display_text: string;
  source_locator: {
    kind: string;
    label: string;
    page?: number;
    section?: string;
  };
  status: "approved" | "superseded" | "withdrawn";
  supersedes_fact_id: string | null;
  approved_at: Date;
}

export interface FactProposalRecord {
  id: string;
  type: string;
  proposed_value: unknown;
  display_text: string;
  source_locator: {
    kind: string;
    label: string;
    page?: number;
    section?: string;
  };
  status: "pending" | "approved" | "rejected" | "merged";
  approved_fact_id: string | null;
}

type Queryable = Pick<Pool | PoolClient, "query">;

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

async function writeAudit(
  client: Queryable,
  principal: WorkspacePrincipal,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, boolean | number | string | null> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events
       (workspace_id, actor_user_id, action, target_type, target_id, outcome, correlation_id, metadata)
     VALUES ($1, $2, $3, $4, $5, 'succeeded', $6, $7::jsonb)`,
    [
      principal.workspaceId,
      principal.userId,
      action,
      targetType,
      targetId,
      crypto.randomUUID(),
      JSON.stringify(metadata),
    ],
  );
}

export class CareerRepository {
  public constructor(private readonly pool: Pool) {}

  public async listEntries(
    principal: WorkspacePrincipal,
    filters: {
      query?: string;
      type?: string;
      status?: "active" | "archived";
      tag?: string;
    } = {},
  ): Promise<CareerEntryRecord[]> {
    const result = await this.pool.query<CareerEntryRecord>(
      `SELECT e.id, e.type, e.title, e.organization, e.location, e.description,
              e.start_date::text, e.start_date_precision, e.end_date::text,
              e.end_date_precision, e.is_current, e.tags, e.status, e.revision,
              count(DISTINCT f.id) FILTER (WHERE f.status = 'approved')::int AS approved_fact_count,
              count(DISTINCT p.id) FILTER (WHERE p.status = 'pending')::int AS pending_proposal_count,
              EXISTS (SELECT 1 FROM career_entries duplicate
                      WHERE duplicate.workspace_id=e.workspace_id AND duplicate.id<>e.id
                        AND lower(duplicate.title)=lower(e.title)
                        AND coalesce(lower(duplicate.organization),'')=coalesce(lower(e.organization),'')) AS possible_duplicate
       FROM career_entries e
       LEFT JOIN evidence_facts f ON f.career_entry_id = e.id AND f.workspace_id = e.workspace_id
       LEFT JOIN fact_proposals p ON p.career_entry_id = e.id AND p.workspace_id = e.workspace_id
       WHERE e.workspace_id = $1
         AND e.status = $2
         AND ($3::text IS NULL OR e.type::text = $3)
         AND ($4::text IS NULL OR $4 = ANY(e.tags))
         AND ($5::text IS NULL OR concat_ws(' ', e.title, e.organization, e.location, e.description) ILIKE '%' || $5 || '%'
              OR EXISTS (SELECT 1 FROM evidence_facts sf WHERE sf.workspace_id = e.workspace_id AND sf.career_entry_id = e.id AND sf.display_text ILIKE '%' || $5 || '%'))
       GROUP BY e.id
       ORDER BY e.updated_at DESC, e.id`,
      [
        principal.workspaceId,
        filters.status ?? "active",
        filters.type || null,
        filters.tag?.toLowerCase() || null,
        filters.query?.trim() || null,
      ],
    );
    return result.rows;
  }

  public async createEntry(
    principal: WorkspacePrincipal,
    raw: CareerEntryInput,
  ): Promise<string> {
    const input = careerEntryInputSchema.parse(raw);
    const start = normalizePartialDate(input.startDate);
    const end = normalizePartialDate(input.endDate);
    return transaction(this.pool, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO career_entries
           (workspace_id, career_profile_id, type, title, organization, location, description,
            start_date, start_date_precision, end_date, end_date_precision, is_current, tags)
         SELECT $1, id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
         FROM career_profiles WHERE workspace_id = $1
         RETURNING id`,
        [
          principal.workspaceId,
          input.type,
          input.title,
          input.organization,
          input.location,
          input.description,
          start?.date ?? null,
          start?.precision ?? null,
          end?.date ?? null,
          end?.precision ?? null,
          input.isCurrent,
          input.tags,
        ],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new CareerNotFoundError();
      await writeAudit(
        client,
        principal,
        "career_entry.create",
        "career_entry",
        id,
        { type: input.type },
      );
      return id;
    });
  }

  public async getEntry(
    principal: WorkspacePrincipal,
    id: string,
  ): Promise<{
    entry: CareerEntryRecord;
    facts: EvidenceFactRecord[];
    proposals: FactProposalRecord[];
  }> {
    const entry = await this.pool.query<CareerEntryRecord>(
      `SELECT e.id, e.type, e.title, e.organization, e.location, e.description,
              e.start_date::text, e.start_date_precision, e.end_date::text,
              e.end_date_precision, e.is_current, e.tags, e.status, e.revision,
              (SELECT count(*)::int FROM evidence_facts f WHERE f.career_entry_id=e.id AND f.workspace_id=e.workspace_id AND f.status='approved') approved_fact_count,
              (SELECT count(*)::int FROM fact_proposals p WHERE p.career_entry_id=e.id AND p.workspace_id=e.workspace_id AND p.status='pending') pending_proposal_count,
              EXISTS (SELECT 1 FROM career_entries duplicate WHERE duplicate.workspace_id=e.workspace_id AND duplicate.id<>e.id AND lower(duplicate.title)=lower(e.title) AND coalesce(lower(duplicate.organization),'')=coalesce(lower(e.organization),'')) possible_duplicate
       FROM career_entries e WHERE e.id=$1 AND e.workspace_id=$2`,
      [id, principal.workspaceId],
    );
    if (!entry.rows[0]) throw new CareerNotFoundError();
    const [facts, proposals] = await Promise.all([
      this.pool.query<EvidenceFactRecord>(
        `SELECT id,type,value,display_text,source_locator,status,supersedes_fact_id,approved_at FROM evidence_facts WHERE career_entry_id=$1 AND workspace_id=$2 ORDER BY created_at DESC`,
        [id, principal.workspaceId],
      ),
      this.pool.query<FactProposalRecord>(
        `SELECT id,type,proposed_value,display_text,source_locator,status,approved_fact_id FROM fact_proposals WHERE career_entry_id=$1 AND workspace_id=$2 ORDER BY created_at DESC`,
        [id, principal.workspaceId],
      ),
    ]);
    return {
      entry: entry.rows[0],
      facts: facts.rows,
      proposals: proposals.rows,
    };
  }

  public async updateEntry(
    principal: WorkspacePrincipal,
    id: string,
    expectedRevision: number,
    raw: CareerEntryInput,
  ): Promise<number> {
    const input = careerEntryInputSchema.parse(raw);
    const start = normalizePartialDate(input.startDate);
    const end = normalizePartialDate(input.endDate);
    const result = await this.pool.query<{ revision: number }>(
      `UPDATE career_entries SET type=$3,title=$4,organization=$5,location=$6,description=$7,
         start_date=$8,start_date_precision=$9,end_date=$10,end_date_precision=$11,is_current=$12,tags=$13,
         revision=revision+1,updated_at=now()
       WHERE id=$1 AND workspace_id=$2 AND revision=$14 RETURNING revision`,
      [
        id,
        principal.workspaceId,
        input.type,
        input.title,
        input.organization,
        input.location,
        input.description,
        start?.date ?? null,
        start?.precision ?? null,
        end?.date ?? null,
        end?.precision ?? null,
        input.isCurrent,
        input.tags,
        expectedRevision,
      ],
    );
    if (!result.rows[0]) {
      const exists = await this.pool.query(
        "SELECT 1 FROM career_entries WHERE id=$1 AND workspace_id=$2",
        [id, principal.workspaceId],
      );
      if (!exists.rowCount) throw new CareerNotFoundError();
      throw new CareerConflictError();
    }
    await writeAudit(
      this.pool,
      principal,
      "career_entry.update",
      "career_entry",
      id,
      { revision: result.rows[0].revision },
    );
    return result.rows[0].revision;
  }

  public async setArchived(
    principal: WorkspacePrincipal,
    id: string,
    archived: boolean,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE career_entries SET status=$3::career_entry_status,archived_at=CASE WHEN $3::text='archived' THEN now() ELSE NULL END,revision=revision+1,updated_at=now()
       WHERE id=$1 AND workspace_id=$2`,
      [id, principal.workspaceId, archived ? "archived" : "active"],
    );
    if (!result.rowCount) throw new CareerNotFoundError();
    await writeAudit(
      this.pool,
      principal,
      archived ? "career_entry.archive" : "career_entry.restore",
      "career_entry",
      id,
    );
  }

  public async createProposal(
    principal: WorkspacePrincipal,
    entryId: string,
    raw: FactProposalInput,
  ): Promise<string> {
    const input = factProposalInputSchema.parse(raw);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO fact_proposals (workspace_id,career_entry_id,type,proposed_value,display_text,source_locator)
       SELECT $1,id,$3,$4::jsonb,$5,$6::jsonb FROM career_entries WHERE id=$2 AND workspace_id=$1 RETURNING id`,
      [
        principal.workspaceId,
        entryId,
        input.type,
        JSON.stringify(input.value),
        input.displayText,
        JSON.stringify(input.sourceLocator),
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new CareerNotFoundError();
    await writeAudit(
      this.pool,
      principal,
      "fact_proposal.create",
      "fact_proposal",
      id,
      { type: input.type },
    );
    return id;
  }

  public async approveProposal(
    principal: WorkspacePrincipal,
    proposalId: string,
  ): Promise<string> {
    return transaction(this.pool, async (client) => {
      const proposal = await client.query<{
        career_entry_id: string;
        type: string;
        proposed_value: unknown;
        display_text: string;
        source_locator: unknown;
        status: string;
      }>(
        `SELECT career_entry_id,type,proposed_value,display_text,source_locator,status FROM fact_proposals WHERE id=$1 AND workspace_id=$2 FOR UPDATE`,
        [proposalId, principal.workspaceId],
      );
      const row = proposal.rows[0];
      if (!row) throw new CareerNotFoundError();
      if (row.status !== "pending") throw new CareerConflictError();
      const fact = await client.query<{ id: string }>(
        `INSERT INTO evidence_facts (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7) RETURNING id`,
        [
          principal.workspaceId,
          row.career_entry_id,
          row.type,
          JSON.stringify(row.proposed_value),
          row.display_text,
          JSON.stringify(row.source_locator),
          principal.userId,
        ],
      );
      const factId = fact.rows[0]!.id;
      await client.query(
        `UPDATE fact_proposals SET status='approved',approved_fact_id=$3,resolved_by_user_id=$4,resolved_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2`,
        [proposalId, principal.workspaceId, factId, principal.userId],
      );
      await writeAudit(
        client,
        principal,
        "fact.approve",
        "evidence_fact",
        factId,
        { proposalId },
      );
      return factId;
    });
  }

  public async rejectProposal(
    principal: WorkspacePrincipal,
    proposalId: string,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE fact_proposals SET status='rejected',resolved_by_user_id=$3,resolved_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status='pending'`,
      [proposalId, principal.workspaceId, principal.userId],
    );
    if (!result.rowCount) throw new CareerNotFoundError();
    await writeAudit(
      this.pool,
      principal,
      "fact_proposal.reject",
      "fact_proposal",
      proposalId,
    );
  }

  public async supersedeFact(
    principal: WorkspacePrincipal,
    factId: string,
    raw: FactProposalInput,
  ): Promise<string> {
    const input = factProposalInputSchema.parse(raw);
    return transaction(this.pool, async (client) => {
      const current = await client.query<{
        career_entry_id: string;
        status: string;
      }>(
        `SELECT career_entry_id,status FROM evidence_facts WHERE id=$1 AND workspace_id=$2 FOR UPDATE`,
        [factId, principal.workspaceId],
      );
      const old = current.rows[0];
      if (!old) throw new CareerNotFoundError();
      if (old.status !== "approved") throw new CareerConflictError();
      const created = await client.query<{ id: string }>(
        `INSERT INTO evidence_facts (workspace_id,career_entry_id,type,value,display_text,source_locator,supersedes_fact_id,approved_by_user_id) VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7,$8) RETURNING id`,
        [
          principal.workspaceId,
          old.career_entry_id,
          input.type,
          JSON.stringify(input.value),
          input.displayText,
          JSON.stringify(input.sourceLocator),
          factId,
          principal.userId,
        ],
      );
      await client.query(
        `UPDATE evidence_facts SET status='superseded' WHERE id=$1 AND workspace_id=$2`,
        [factId, principal.workspaceId],
      );
      const replacementId = created.rows[0]!.id;
      await writeAudit(
        client,
        principal,
        "fact.supersede",
        "evidence_fact",
        factId,
        { replacementId },
      );
      return replacementId;
    });
  }

  public async withdrawFact(
    principal: WorkspacePrincipal,
    factId: string,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE evidence_facts SET status='withdrawn',withdrawn_by_user_id=$3,withdrawn_at=now() WHERE id=$1 AND workspace_id=$2 AND status='approved'`,
      [factId, principal.workspaceId, principal.userId],
    );
    if (!result.rowCount) throw new CareerNotFoundError();
    await writeAudit(
      this.pool,
      principal,
      "fact.withdraw",
      "evidence_fact",
      factId,
    );
  }

  public async listEligibleFacts(
    principal: WorkspacePrincipal,
  ): Promise<EvidenceFactRecord[]> {
    const result = await this.pool.query<EvidenceFactRecord>(
      `SELECT f.id,f.type,f.value,f.display_text,f.source_locator,f.status,f.supersedes_fact_id,f.approved_at FROM evidence_facts f JOIN career_entries e ON e.id=f.career_entry_id AND e.workspace_id=f.workspace_id WHERE f.workspace_id=$1 AND f.status='approved' AND e.status='active' ORDER BY f.approved_at DESC`,
      [principal.workspaceId],
    );
    return result.rows;
  }

  public async listSkills(principal: WorkspacePrincipal): Promise<
    Array<{
      id: string;
      display_name: string;
      category: string | null;
      aliases: string[];
      archived: boolean;
    }>
  > {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      category: string | null;
      aliases: string[];
      archived: boolean;
    }>(
      `SELECT id,display_name,category,aliases,(archived_at IS NOT NULL) archived
       FROM skills WHERE workspace_id=$1 ORDER BY archived_at NULLS FIRST,lower(display_name),id`,
      [principal.workspaceId],
    );
    return result.rows;
  }

  public async createSkill(
    principal: WorkspacePrincipal,
    input: { displayName: string; category?: string; aliases?: string[] },
  ): Promise<string> {
    const displayName = input.displayName.trim();
    if (!displayName || displayName.length > 200) {
      throw new Error("Skill name must contain between 1 and 200 characters.");
    }
    const canonicalName = displayName.toLocaleLowerCase("en-US");
    const aliases = [
      ...new Set(
        (input.aliases ?? []).map((value) => value.trim()).filter(Boolean),
      ),
    ];
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO skills (workspace_id,canonical_name,display_name,category,aliases)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (workspace_id,canonical_name) DO UPDATE
         SET display_name=EXCLUDED.display_name,category=EXCLUDED.category,aliases=EXCLUDED.aliases,archived_at=NULL,updated_at=now()
       RETURNING id`,
      [
        principal.workspaceId,
        canonicalName,
        displayName,
        input.category?.trim() || null,
        aliases,
      ],
    );
    const id = result.rows[0]!.id;
    await writeAudit(this.pool, principal, "skill.save", "skill", id, {
      aliasCount: aliases.length,
    });
    return id;
  }

  public async linkSkill(
    principal: WorkspacePrincipal,
    entryId: string,
    skillId: string,
    proficiency: "familiar" | "working" | "advanced" | "expert" | null,
  ): Promise<void> {
    const result = await this.pool.query(
      `INSERT INTO career_entry_skills (workspace_id,career_entry_id,skill_id,proficiency)
       SELECT $1,e.id,s.id,$4::skill_proficiency
       FROM career_entries e JOIN skills s ON s.id=$3 AND s.workspace_id=$1
       WHERE e.id=$2 AND e.workspace_id=$1
       ON CONFLICT (career_entry_id,skill_id) DO UPDATE SET proficiency=EXCLUDED.proficiency
       RETURNING career_entry_id`,
      [principal.workspaceId, entryId, skillId, proficiency],
    );
    if (!result.rowCount) throw new CareerNotFoundError();
    await writeAudit(
      this.pool,
      principal,
      "career_entry.skill-link",
      "career_entry",
      entryId,
      {
        skillId,
      },
    );
  }

  public async listEntrySkills(
    principal: WorkspacePrincipal,
    entryId: string,
  ): Promise<
    Array<{ id: string; display_name: string; proficiency: string | null }>
  > {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      proficiency: string | null;
    }>(
      `SELECT s.id,s.display_name,link.proficiency
       FROM career_entry_skills link JOIN skills s ON s.id=link.skill_id AND s.workspace_id=link.workspace_id
       WHERE link.workspace_id=$1 AND link.career_entry_id=$2 ORDER BY lower(s.display_name)`,
      [principal.workspaceId, entryId],
    );
    return result.rows;
  }

  public async getProfileSettings(principal: WorkspacePrincipal): Promise<{
    careerGoals: string[];
    targetRoles: string[];
    writingPreferences: {
      tone: "direct" | "formal" | "warm";
      locale: string;
      serialComma: boolean;
    };
  }> {
    const result = await this.pool.query<{
      career_goals: string[];
      target_roles: string[];
      writing_preferences: {
        tone: "direct" | "formal" | "warm";
        locale: string;
        serialComma: boolean;
      };
    }>(
      `INSERT INTO career_profile_settings (workspace_id,career_profile_id)
       SELECT workspace_id,id FROM career_profiles WHERE workspace_id=$1
       ON CONFLICT (workspace_id,career_profile_id) DO UPDATE SET updated_at=career_profile_settings.updated_at
       RETURNING career_goals,target_roles,writing_preferences`,
      [principal.workspaceId],
    );
    const row = result.rows[0];
    if (!row) throw new CareerNotFoundError();
    return {
      careerGoals: row.career_goals,
      targetRoles: row.target_roles,
      writingPreferences: row.writing_preferences,
    };
  }

  public async updateProfileSettings(
    principal: WorkspacePrincipal,
    input: {
      careerGoals: string[];
      targetRoles: string[];
      tone: "direct" | "formal" | "warm";
    },
  ): Promise<void> {
    const clean = (values: string[]) =>
      [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(
        0,
        50,
      );
    const result = await this.pool.query(
      `UPDATE career_profile_settings SET career_goals=$2,target_roles=$3,
         writing_preferences=jsonb_set(writing_preferences,'{tone}',to_jsonb($4::text)),updated_at=now()
       WHERE workspace_id=$1`,
      [
        principal.workspaceId,
        clean(input.careerGoals),
        clean(input.targetRoles),
        input.tone,
      ],
    );
    if (!result.rowCount) throw new CareerNotFoundError();
    await writeAudit(
      this.pool,
      principal,
      "career_profile.settings-update",
      "workspace",
      principal.workspaceId,
      {
        careerGoalCount: clean(input.careerGoals).length,
        targetRoleCount: clean(input.targetRoles).length,
      },
    );
  }

  public async dependencyPreview(
    principal: WorkspacePrincipal,
    entryId: string,
  ): Promise<{ facts: number; proposals: number; skillLinks: number }> {
    const result = await this.pool.query<{
      facts: number;
      proposals: number;
      skill_links: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM evidence_facts WHERE career_entry_id=$1 AND workspace_id=$2) facts,
         (SELECT count(*)::int FROM fact_proposals WHERE career_entry_id=$1 AND workspace_id=$2) proposals,
         (SELECT count(*)::int FROM career_entry_skills WHERE career_entry_id=$1 AND workspace_id=$2) skill_links
       WHERE EXISTS (SELECT 1 FROM career_entries WHERE id=$1 AND workspace_id=$2)`,
      [entryId, principal.workspaceId],
    );
    const row = result.rows[0];
    if (!row) throw new CareerNotFoundError();
    return {
      facts: row.facts,
      proposals: row.proposals,
      skillLinks: row.skill_links,
    };
  }

  public async deleteEntry(
    principal: WorkspacePrincipal,
    entryId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const locked = await client.query(
        `SELECT 1 FROM career_entries WHERE id=$1 AND workspace_id=$2 FOR UPDATE`,
        [entryId, principal.workspaceId],
      );
      if (!locked.rowCount) throw new CareerNotFoundError();
      await client.query(
        `DELETE FROM career_entry_skills WHERE career_entry_id=$1 AND workspace_id=$2`,
        [entryId, principal.workspaceId],
      );
      await client.query(
        `DELETE FROM fact_proposals WHERE career_entry_id=$1 AND workspace_id=$2`,
        [entryId, principal.workspaceId],
      );
      let removed = 1;
      while (removed > 0) {
        const result = await client.query(
          `DELETE FROM evidence_facts f WHERE f.career_entry_id=$1 AND f.workspace_id=$2 AND NOT EXISTS (SELECT 1 FROM evidence_facts child WHERE child.supersedes_fact_id=f.id AND child.workspace_id=f.workspace_id)`,
          [entryId, principal.workspaceId],
        );
        removed = result.rowCount ?? 0;
      }
      await client.query(
        `DELETE FROM career_entries WHERE id=$1 AND workspace_id=$2`,
        [entryId, principal.workspaceId],
      );
      await writeAudit(
        client,
        principal,
        "career_entry.delete",
        "career_entry",
        entryId,
      );
    });
  }
}
