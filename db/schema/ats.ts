import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { documentVersions } from "./documents";
import { workspaces } from "./identity";
import { jobPostingRevisions, jobRequirementSets } from "./jobs";

export const atsReports = pgTable(
  "ats_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id").notNull(),
    jobPostingRevisionId: uuid("job_posting_revision_id"),
    requirementSetId: uuid("requirement_set_id"),
    rulesetVersion: text("ruleset_version").notNull(),
    documentHash: text("document_hash").notNull(),
    jobHash: text("job_hash"),
    inputHash: text("input_hash").notNull(),
    evaluatedWeight: integer("evaluated_weight").notNull(),
    overallScoreBasisPoints: integer("overall_score_basis_points"),
    blockerCount: integer("blocker_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ats_reports_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("ats_reports_workspace_input_unique").on(
      table.workspaceId,
      table.inputHash,
    ),
    index("ats_reports_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    foreignKey({
      name: "ats_reports_version_workspace_fk",
      columns: [table.documentVersionId, table.workspaceId],
      foreignColumns: [documentVersions.id, documentVersions.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "ats_reports_job_revision_workspace_fk",
      columns: [table.jobPostingRevisionId, table.workspaceId],
      foreignColumns: [jobPostingRevisions.id, jobPostingRevisions.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "ats_reports_requirement_set_workspace_fk",
      columns: [table.requirementSetId, table.workspaceId],
      foreignColumns: [jobRequirementSets.id, jobRequirementSets.workspaceId],
    }).onDelete("restrict"),
    check(
      "ats_reports_hashes",
      sql`${table.documentHash} ~ '^sha256:[0-9a-f]{64}$' AND ${table.inputHash} ~ '^sha256:[0-9a-f]{64}$' AND (${table.jobHash} IS NULL OR ${table.jobHash} ~ '^sha256:[0-9a-f]{64}$')`,
    ),
    check(
      "ats_reports_score_bounds",
      sql`${table.evaluatedWeight} BETWEEN 0 AND 100 AND (${table.overallScoreBasisPoints} IS NULL OR ${table.overallScoreBasisPoints} BETWEEN 0 AND 10000) AND ${table.blockerCount} >= 0`,
    ),
    check(
      "ats_reports_context_pair",
      sql`(${table.jobPostingRevisionId} IS NULL) = (${table.requirementSetId} IS NULL) AND (${table.jobPostingRevisionId} IS NULL) = (${table.jobHash} IS NULL)`,
    ),
  ],
);

export const atsCategoryScores = pgTable(
  "ats_category_scores",
  {
    workspaceId: uuid("workspace_id").notNull(),
    reportId: uuid("report_id").notNull(),
    category: text("category").notNull(),
    label: text("label").notNull(),
    weight: integer("weight").notNull(),
    earnedPoints: integer("earned_points").notNull(),
    applicablePoints: integer("applicable_points").notNull(),
    scoreBasisPoints: integer("score_basis_points"),
  },
  (table) => [
    primaryKey({ columns: [table.reportId, table.category] }),
    foreignKey({
      name: "ats_category_scores_report_workspace_fk",
      columns: [table.reportId, table.workspaceId],
      foreignColumns: [atsReports.id, atsReports.workspaceId],
    }).onDelete("cascade"),
    check(
      "ats_category_scores_bounds",
      sql`${table.weight} > 0 AND ${table.earnedPoints} >= 0 AND ${table.applicablePoints} >= 0 AND ${table.earnedPoints} <= ${table.applicablePoints} AND (${table.scoreBasisPoints} IS NULL OR ${table.scoreBasisPoints} BETWEEN 0 AND 10000)`,
    ),
  ],
);

export const atsFindings = pgTable(
  "ats_findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    reportId: uuid("report_id").notNull(),
    sequence: integer("sequence").notNull(),
    ruleId: text("rule_id").notNull(),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    location: jsonb("location").$type<Record<string, unknown>>().notNull(),
    measured: jsonb("measured").$type<Record<string, unknown>>().notNull(),
    threshold: jsonb("threshold").$type<Record<string, unknown>>().notNull(),
    message: text("message").notNull(),
    remediation: text("remediation").notNull(),
    pointLossBasisPoints: integer("point_loss_basis_points").notNull(),
    blocker: boolean("blocker").default(false).notNull(),
  },
  (table) => [
    uniqueIndex("ats_findings_report_sequence_unique").on(
      table.reportId,
      table.sequence,
    ),
    index("ats_findings_report_category_idx").on(
      table.reportId,
      table.category,
    ),
    foreignKey({
      name: "ats_findings_report_workspace_fk",
      columns: [table.reportId, table.workspaceId],
      foreignColumns: [atsReports.id, atsReports.workspaceId],
    }).onDelete("cascade"),
    check(
      "ats_findings_point_bounds",
      sql`${table.pointLossBasisPoints} BETWEEN 0 AND 10000`,
    ),
    check(
      "ats_findings_objects",
      sql`jsonb_typeof(${table.location})='object' AND jsonb_typeof(${table.measured})='object' AND jsonb_typeof(${table.threshold})='object'`,
    ),
  ],
);
