import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { careerProfiles } from "./career-profile";
import { mutableTimestamps } from "./common";
import { users, workspaces } from "./identity";

export const careerEntryType = pgEnum("career_entry_type", [
  "work",
  "internship",
  "project",
  "research",
  "education",
  "certification",
  "award",
  "leadership",
  "extracurricular",
  "volunteering",
  "coursework",
  "publication",
  "accomplishment",
  "metric",
  "skill",
  "custom",
]);
export const careerEntryStatus = pgEnum("career_entry_status", [
  "active",
  "archived",
]);
export const datePrecision = pgEnum("date_precision", ["day", "month", "year"]);
export const evidenceFactType = pgEnum("evidence_fact_type", [
  "statement",
  "metric",
  "date",
  "skill",
  "accomplishment",
  "education",
  "custom",
]);
export const evidenceFactStatus = pgEnum("evidence_fact_status", [
  "approved",
  "superseded",
  "withdrawn",
]);
export const factProposalStatus = pgEnum("fact_proposal_status", [
  "pending",
  "approved",
  "rejected",
  "merged",
]);
export const skillProficiency = pgEnum("skill_proficiency", [
  "familiar",
  "working",
  "advanced",
  "expert",
]);

export interface SourceLocatorValue {
  kind: "manual" | "document";
  label: string;
  page?: number;
  section?: string;
  sourceDocumentId?: string;
}

export type EvidenceValue =
  | { kind: "text"; text: string }
  | { kind: "metric"; value: number; unit: string; context: string }
  | { kind: "date"; value: string; precision: "day" | "month" | "year" }
  | { kind: "skill"; name: string };

export const careerEntries = pgTable(
  "career_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    careerProfileId: uuid("career_profile_id").notNull(),
    type: careerEntryType("type").notNull(),
    title: text("title").notNull(),
    organization: text("organization"),
    location: text("location"),
    description: text("description"),
    startDate: date("start_date", { mode: "string" }),
    startDatePrecision: datePrecision("start_date_precision"),
    endDate: date("end_date", { mode: "string" }),
    endDatePrecision: datePrecision("end_date_precision"),
    isCurrent: boolean("is_current").default(false).notNull(),
    tags: text("tags")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    attributes: jsonb("attributes")
      .$type<Record<string, boolean | number | string | null>>()
      .default({})
      .notNull(),
    status: careerEntryStatus("status").default("active").notNull(),
    revision: integer("revision").default(1).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("career_entries_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    index("career_entries_workspace_status_type_idx").on(
      table.workspaceId,
      table.status,
      table.type,
    ),
    index("career_entries_tags_idx").using("gin", table.tags),
    foreignKey({
      name: "career_entries_profile_workspace_fk",
      columns: [table.careerProfileId, table.workspaceId],
      foreignColumns: [careerProfiles.id, careerProfiles.workspaceId],
    }).onDelete("cascade"),
    check(
      "career_entries_date_pairs",
      sql`(${table.startDate} IS NULL) = (${table.startDatePrecision} IS NULL)
          AND (${table.endDate} IS NULL) = (${table.endDatePrecision} IS NULL)`,
    ),
    check(
      "career_entries_date_order",
      sql`${table.endDate} IS NULL OR ${table.startDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
    check(
      "career_entries_current_has_no_end",
      sql`NOT ${table.isCurrent} OR ${table.endDate} IS NULL`,
    ),
    check("career_entries_revision_positive", sql`${table.revision} > 0`),
    check(
      "career_entries_attributes_object",
      sql`jsonb_typeof(${table.attributes}) = 'object'`,
    ),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    canonicalName: text("canonical_name").notNull(),
    displayName: text("display_name").notNull(),
    category: text("category"),
    aliases: text("aliases")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("skills_workspace_canonical_unique").on(
      table.workspaceId,
      table.canonicalName,
    ),
    uniqueIndex("skills_id_workspace_unique").on(table.id, table.workspaceId),
    index("skills_workspace_display_idx").on(
      table.workspaceId,
      table.displayName,
    ),
  ],
);

export const evidenceFacts = pgTable(
  "evidence_facts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    careerEntryId: uuid("career_entry_id").notNull(),
    type: evidenceFactType("type").notNull(),
    value: jsonb("value").$type<EvidenceValue>().notNull(),
    displayText: text("display_text").notNull(),
    sourceLocator: jsonb("source_locator")
      .$type<SourceLocatorValue>()
      .notNull(),
    status: evidenceFactStatus("status").default("approved").notNull(),
    supersedesFactId: uuid("supersedes_fact_id"),
    approvedByUserId: uuid("approved_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    withdrawnByUserId: uuid("withdrawn_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    withdrawnAt: timestamp("withdrawn_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("evidence_facts_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    index("evidence_facts_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.type,
    ),
    foreignKey({
      name: "evidence_facts_entry_workspace_fk",
      columns: [table.careerEntryId, table.workspaceId],
      foreignColumns: [careerEntries.id, careerEntries.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "evidence_facts_supersedes_workspace_fk",
      columns: [table.supersedesFactId, table.workspaceId],
      foreignColumns: [table.id, table.workspaceId],
    }).onDelete("restrict"),
    check(
      "evidence_facts_value_object",
      sql`jsonb_typeof(${table.value}) = 'object'`,
    ),
    check(
      "evidence_facts_locator_object",
      sql`jsonb_typeof(${table.sourceLocator}) = 'object'`,
    ),
    check(
      "evidence_facts_withdrawal_pair",
      sql`(${table.withdrawnAt} IS NULL) = (${table.withdrawnByUserId} IS NULL)`,
    ),
  ],
);

export const factProposals = pgTable(
  "fact_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    careerEntryId: uuid("career_entry_id").notNull(),
    type: evidenceFactType("type").notNull(),
    proposedValue: jsonb("proposed_value").$type<EvidenceValue>().notNull(),
    displayText: text("display_text").notNull(),
    sourceLocator: jsonb("source_locator")
      .$type<SourceLocatorValue>()
      .notNull(),
    status: factProposalStatus("status").default("pending").notNull(),
    approvedFactId: uuid("approved_fact_id"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("fact_proposals_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    index("fact_proposals_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    foreignKey({
      name: "fact_proposals_entry_workspace_fk",
      columns: [table.careerEntryId, table.workspaceId],
      foreignColumns: [careerEntries.id, careerEntries.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "fact_proposals_approved_fact_workspace_fk",
      columns: [table.approvedFactId, table.workspaceId],
      foreignColumns: [evidenceFacts.id, evidenceFacts.workspaceId],
    }).onDelete("restrict"),
    check(
      "fact_proposals_value_object",
      sql`jsonb_typeof(${table.proposedValue}) = 'object'`,
    ),
    check(
      "fact_proposals_locator_object",
      sql`jsonb_typeof(${table.sourceLocator}) = 'object'`,
    ),
    check(
      "fact_proposals_resolution_pair",
      sql`(${table.resolvedAt} IS NULL) = (${table.resolvedByUserId} IS NULL)`,
    ),
  ],
);

export const careerEntrySkills = pgTable(
  "career_entry_skills",
  {
    workspaceId: uuid("workspace_id").notNull(),
    careerEntryId: uuid("career_entry_id").notNull(),
    skillId: uuid("skill_id").notNull(),
    evidenceFactId: uuid("evidence_fact_id"),
    proficiency: skillProficiency("proficiency"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "career_entry_skills_pk",
      columns: [table.careerEntryId, table.skillId],
    }),
    index("career_entry_skills_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "career_entry_skills_entry_workspace_fk",
      columns: [table.careerEntryId, table.workspaceId],
      foreignColumns: [careerEntries.id, careerEntries.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "career_entry_skills_skill_workspace_fk",
      columns: [table.skillId, table.workspaceId],
      foreignColumns: [skills.id, skills.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "career_entry_skills_fact_workspace_fk",
      columns: [table.evidenceFactId, table.workspaceId],
      foreignColumns: [evidenceFacts.id, evidenceFacts.workspaceId],
    }).onDelete("restrict"),
  ],
);

export const careerProfileSettings = pgTable(
  "career_profile_settings",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    careerProfileId: uuid("career_profile_id").notNull(),
    careerGoals: text("career_goals")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    targetRoles: text("target_roles")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    writingPreferences: jsonb("writing_preferences")
      .$type<{
        tone: "direct" | "formal" | "warm";
        locale: string;
        serialComma: boolean;
      }>()
      .default({ tone: "direct", locale: "en-US", serialComma: true })
      .notNull(),
    ...mutableTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "career_profile_settings_pk",
      columns: [table.workspaceId, table.careerProfileId],
    }),
    foreignKey({
      name: "career_profile_settings_profile_workspace_fk",
      columns: [table.careerProfileId, table.workspaceId],
      foreignColumns: [careerProfiles.id, careerProfiles.workspaceId],
    }).onDelete("cascade"),
    check(
      "career_profile_settings_writing_object",
      sql`jsonb_typeof(${table.writingPreferences}) = 'object'`,
    ),
  ],
);
