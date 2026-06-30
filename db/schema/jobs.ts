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

import { mutableTimestamps } from "./common";
import { users, workspaces } from "./identity";
import { jobOperations } from "./operations";
import { sourceDocuments } from "./sources";

export const jobPostingStatus = pgEnum("job_posting_status", [
  "active",
  "archived",
]);
export const jobInputMethod = pgEnum("job_input_method", [
  "text",
  "file",
  "url",
]);
export const jobUrlImportStatus = pgEnum("job_url_import_status", [
  "pending",
  "succeeded",
  "failed",
]);
export const jobRequirementSetStatus = pgEnum("job_requirement_set_status", [
  "draft",
  "reviewed",
]);
export const jobRequirementSetMethod = pgEnum("job_requirement_set_method", [
  "manual",
  "deterministic",
  "ai",
]);
export const jobRequirementCategory = pgEnum("job_requirement_category", [
  "required_qualification",
  "preferred_qualification",
  "responsibility",
  "keyword",
  "seniority",
  "ambiguity",
]);
export const jobRequirementPriority = pgEnum("job_requirement_priority", [
  "required",
  "preferred",
  "informational",
]);
export const jobRequirementDecision = pgEnum("job_requirement_decision", [
  "proposed",
  "accepted",
  "rejected",
]);

export interface JobRevisionMetadata {
  schemaVersion: 1;
  warnings: string[];
  sourceName?: string;
  sourceMediaType?: string;
  retrieval?: {
    requestedUrl: string;
    finalOrigin: string;
    retrievedAt: string;
  };
}

export interface JobRequirementAnalysisMetadata {
  schemaVersion: 1;
  taskVersion: string;
  warnings: string[];
  providerConfigurationId?: string;
  model?: string;
  attempts?: number;
  inputHash: string;
  outputHash?: string;
}

export const jobPostings = pgTable(
  "job_postings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    company: text("company"),
    status: jobPostingStatus("status").default("active").notNull(),
    revision: integer("revision").default(1).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("job_postings_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    index("job_postings_workspace_status_created_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    check("job_postings_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const jobPostingRevisions = pgTable(
  "job_posting_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    jobPostingId: uuid("job_posting_id").notNull(),
    parentRevisionId: uuid("parent_revision_id"),
    sourceDocumentId: uuid("source_document_id"),
    inputMethod: jobInputMethod("input_method").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    normalizedText: text("normalized_text").notNull(),
    contentHash: text("content_hash").notNull(),
    metadata: jsonb("metadata")
      .$type<JobRevisionMetadata>()
      .default({ schemaVersion: 1, warnings: [] })
      .notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("job_posting_revisions_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("job_posting_revisions_number_unique").on(
      table.jobPostingId,
      table.revisionNumber,
    ),
    index("job_posting_revisions_job_created_idx").on(
      table.jobPostingId,
      table.createdAt,
    ),
    foreignKey({
      name: "job_posting_revisions_posting_workspace_fk",
      columns: [table.jobPostingId, table.workspaceId],
      foreignColumns: [jobPostings.id, jobPostings.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "job_posting_revisions_parent_workspace_fk",
      columns: [table.parentRevisionId, table.workspaceId],
      foreignColumns: [table.id, table.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "job_posting_revisions_source_workspace_fk",
      columns: [table.sourceDocumentId, table.workspaceId],
      foreignColumns: [sourceDocuments.id, sourceDocuments.workspaceId],
    }).onDelete("restrict"),
    check(
      "job_posting_revisions_number_positive",
      sql`${table.revisionNumber} > 0`,
    ),
    check(
      "job_posting_revisions_text_not_blank",
      sql`length(btrim(${table.normalizedText})) > 0`,
    ),
    check(
      "job_posting_revisions_hash_format",
      sql`${table.contentHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    check(
      "job_posting_revisions_metadata_object",
      sql`jsonb_typeof(${table.metadata}) = 'object'`,
    ),
    check(
      "job_posting_revisions_source_method",
      sql`(${table.inputMethod} = 'file') = (${table.sourceDocumentId} IS NOT NULL)`,
    ),
  ],
);

export const jobUrlImports = pgTable(
  "job_url_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    operationId: uuid("operation_id").notNull(),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    company: text("company"),
    requestedUrl: text("requested_url").notNull(),
    status: jobUrlImportStatus("status").default("pending").notNull(),
    jobPostingId: uuid("job_posting_id"),
    errorCode: text("error_code"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("job_url_imports_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("job_url_imports_operation_unique").on(table.operationId),
    index("job_url_imports_workspace_status_created_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    foreignKey({
      name: "job_url_imports_operation_workspace_fk",
      columns: [table.operationId, table.workspaceId],
      foreignColumns: [jobOperations.id, jobOperations.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "job_url_imports_posting_workspace_fk",
      columns: [table.jobPostingId, table.workspaceId],
      foreignColumns: [jobPostings.id, jobPostings.workspaceId],
    }).onDelete("restrict"),
    check(
      "job_url_imports_terminal_state",
      sql`(${table.status} = 'pending' AND ${table.completedAt} IS NULL AND ${table.jobPostingId} IS NULL AND ${table.errorCode} IS NULL)
          OR (${table.status} = 'succeeded' AND ${table.completedAt} IS NOT NULL AND ${table.jobPostingId} IS NOT NULL AND ${table.errorCode} IS NULL)
          OR (${table.status} = 'failed' AND ${table.completedAt} IS NOT NULL AND ${table.jobPostingId} IS NULL AND ${table.errorCode} IS NOT NULL)`,
    ),
  ],
);

export const jobRequirementSets = pgTable(
  "job_requirement_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    jobPostingRevisionId: uuid("job_posting_revision_id").notNull(),
    parentSetId: uuid("parent_set_id"),
    revisionNumber: integer("revision_number").notNull(),
    method: jobRequirementSetMethod("method").notNull(),
    status: jobRequirementSetStatus("status").default("draft").notNull(),
    metadata: jsonb("metadata")
      .$type<JobRequirementAnalysisMetadata>()
      .notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("job_requirement_sets_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("job_requirement_sets_revision_unique").on(
      table.jobPostingRevisionId,
      table.revisionNumber,
    ),
    index("job_requirement_sets_job_status_idx").on(
      table.jobPostingRevisionId,
      table.status,
      table.createdAt,
    ),
    foreignKey({
      name: "job_requirement_sets_job_revision_workspace_fk",
      columns: [table.jobPostingRevisionId, table.workspaceId],
      foreignColumns: [jobPostingRevisions.id, jobPostingRevisions.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "job_requirement_sets_parent_workspace_fk",
      columns: [table.parentSetId, table.workspaceId],
      foreignColumns: [table.id, table.workspaceId],
    }).onDelete("restrict"),
    check(
      "job_requirement_sets_revision_positive",
      sql`${table.revisionNumber} > 0`,
    ),
    check(
      "job_requirement_sets_reviewed_state",
      sql`(${table.status} = 'draft' AND ${table.reviewedAt} IS NULL) OR (${table.status} = 'reviewed' AND ${table.reviewedAt} IS NOT NULL)`,
    ),
    check(
      "job_requirement_sets_metadata_object",
      sql`jsonb_typeof(${table.metadata}) = 'object'`,
    ),
  ],
);

export const jobRequirements = pgTable(
  "job_requirements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    requirementSetId: uuid("requirement_set_id").notNull(),
    category: jobRequirementCategory("category").notNull(),
    priority: jobRequirementPriority("priority").notNull(),
    decision: jobRequirementDecision("decision").default("proposed").notNull(),
    requirementText: text("requirement_text").notNull(),
    sourceStart: integer("source_start"),
    sourceEnd: integer("source_end"),
    sourceText: text("source_text"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("job_requirements_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("job_requirements_id_workspace_set_unique").on(
      table.id,
      table.workspaceId,
      table.requirementSetId,
    ),
    index("job_requirements_set_category_idx").on(
      table.requirementSetId,
      table.category,
      table.decision,
    ),
    foreignKey({
      name: "job_requirements_set_workspace_fk",
      columns: [table.requirementSetId, table.workspaceId],
      foreignColumns: [jobRequirementSets.id, jobRequirementSets.workspaceId],
    }).onDelete("cascade"),
    check(
      "job_requirements_text_not_blank",
      sql`length(btrim(${table.requirementText})) > 0`,
    ),
    check(
      "job_requirements_source_triplet",
      sql`(${table.sourceStart} IS NULL AND ${table.sourceEnd} IS NULL AND ${table.sourceText} IS NULL) OR (${table.sourceStart} >= 0 AND ${table.sourceEnd} > ${table.sourceStart} AND ${table.sourceText} IS NOT NULL AND length(${table.sourceText}) > 0)`,
    ),
  ],
);
