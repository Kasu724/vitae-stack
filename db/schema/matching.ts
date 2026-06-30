import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { evidenceFacts } from "./career";
import { jobRequirements, jobRequirementSets } from "./jobs";
import { users, workspaces } from "./identity";

export const evidenceMatchStrength = pgEnum("evidence_match_strength", [
  "direct",
  "combined",
  "weak",
]);
export const evidenceMatchDecision = pgEnum("evidence_match_decision", [
  "included",
  "excluded",
]);

export interface EvidenceMatchSignals {
  schemaVersion: 1;
  matchedTokens: string[];
  requirementTokenCount: number;
  exactSkill: boolean;
  phraseMatch: boolean;
}

export const requirementMatchRuns = pgTable(
  "requirement_match_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    requirementSetId: uuid("requirement_set_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    inputHash: text("input_hash").notNull(),
    eligibleFactCount: integer("eligible_fact_count").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("requirement_match_runs_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("requirement_match_runs_context_unique").on(
      table.id,
      table.workspaceId,
      table.requirementSetId,
    ),
    uniqueIndex("requirement_match_runs_revision_unique").on(
      table.requirementSetId,
      table.revisionNumber,
    ),
    index("requirement_match_runs_set_created_idx").on(
      table.requirementSetId,
      table.createdAt,
    ),
    foreignKey({
      name: "requirement_match_runs_set_workspace_fk",
      columns: [table.requirementSetId, table.workspaceId],
      foreignColumns: [jobRequirementSets.id, jobRequirementSets.workspaceId],
    }).onDelete("cascade"),
    check(
      "requirement_match_runs_revision_positive",
      sql`${table.revisionNumber} > 0`,
    ),
    check(
      "requirement_match_runs_fact_count_nonnegative",
      sql`${table.eligibleFactCount} >= 0`,
    ),
    check(
      "requirement_match_runs_hash_format",
      sql`${table.inputHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
  ],
);

export const requirementEvidenceMatches = pgTable(
  "requirement_evidence_matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    matchRunId: uuid("match_run_id").notNull(),
    requirementSetId: uuid("requirement_set_id").notNull(),
    requirementId: uuid("requirement_id").notNull(),
    evidenceFactId: uuid("evidence_fact_id").notNull(),
    strength: evidenceMatchStrength("strength").notNull(),
    scoreBasisPoints: integer("score_basis_points").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    signals: jsonb("signals").$type<EvidenceMatchSignals>().notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("requirement_evidence_matches_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("requirement_evidence_matches_candidate_unique").on(
      table.matchRunId,
      table.requirementId,
      table.evidenceFactId,
    ),
    index("requirement_evidence_matches_requirement_score_idx").on(
      table.requirementId,
      table.scoreBasisPoints,
    ),
    foreignKey({
      name: "requirement_evidence_matches_run_context_fk",
      columns: [table.matchRunId, table.workspaceId, table.requirementSetId],
      foreignColumns: [
        requirementMatchRuns.id,
        requirementMatchRuns.workspaceId,
        requirementMatchRuns.requirementSetId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "requirement_evidence_matches_requirement_context_fk",
      columns: [table.requirementId, table.workspaceId, table.requirementSetId],
      foreignColumns: [
        jobRequirements.id,
        jobRequirements.workspaceId,
        jobRequirements.requirementSetId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "requirement_evidence_matches_fact_workspace_fk",
      columns: [table.evidenceFactId, table.workspaceId],
      foreignColumns: [evidenceFacts.id, evidenceFacts.workspaceId],
    }).onDelete("restrict"),
    check(
      "requirement_evidence_matches_score_range",
      sql`${table.scoreBasisPoints} >= 0 AND ${table.scoreBasisPoints} <= 10000`,
    ),
    check(
      "requirement_evidence_matches_signals_object",
      sql`jsonb_typeof(${table.signals}) = 'object'`,
    ),
  ],
);

export const requirementEvidenceDecisions = pgTable(
  "requirement_evidence_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    matchId: uuid("match_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    decision: evidenceMatchDecision("decision").notNull(),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("requirement_evidence_decisions_match_revision_unique").on(
      table.matchId,
      table.revisionNumber,
    ),
    index("requirement_evidence_decisions_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    foreignKey({
      name: "requirement_evidence_decisions_match_workspace_fk",
      columns: [table.matchId, table.workspaceId],
      foreignColumns: [
        requirementEvidenceMatches.id,
        requirementEvidenceMatches.workspaceId,
      ],
    }).onDelete("cascade"),
    check(
      "requirement_evidence_decisions_revision_positive",
      sql`${table.revisionNumber} > 0`,
    ),
  ],
);
