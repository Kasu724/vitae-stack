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

import {
  careerEntries,
  careerEntryType,
  evidenceFacts,
  evidenceFactType,
  factProposalStatus,
  type EvidenceValue,
  type SourceLocatorValue,
} from "./career";
import { mutableTimestamps } from "./common";
import { users } from "./identity";
import { sourceDocuments } from "./sources";

export const extractionBatchStatus = pgEnum("extraction_batch_status", [
  "pending",
  "completed",
  "cancelled",
]);
export const extractionMethod = pgEnum("extraction_method", [
  "deterministic",
  "ai",
]);

export const extractionBatches = pgTable(
  "extraction_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    sourceDocumentId: uuid("source_document_id").notNull(),
    targetCareerEntryId: uuid("target_career_entry_id"),
    method: extractionMethod("method").notNull(),
    taskVersion: text("task_version").notNull(),
    status: extractionBatchStatus("status").default("pending").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("extraction_batches_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    index("extraction_batches_source_status_idx").on(
      table.sourceDocumentId,
      table.status,
      table.createdAt,
    ),
    uniqueIndex("extraction_batches_one_pending_source_unique")
      .on(table.workspaceId, table.sourceDocumentId)
      .where(sql`${table.status} = 'pending'`),
    foreignKey({
      name: "extraction_batches_source_workspace_fk",
      columns: [table.sourceDocumentId, table.workspaceId],
      foreignColumns: [sourceDocuments.id, sourceDocuments.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "extraction_batches_target_entry_workspace_fk",
      columns: [table.targetCareerEntryId, table.workspaceId],
      foreignColumns: [careerEntries.id, careerEntries.workspaceId],
    }).onDelete("restrict"),
  ],
);

export const extractionProposals = pgTable(
  "extraction_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    sourceDocumentId: uuid("source_document_id").notNull(),
    targetCareerEntryId: uuid("target_career_entry_id"),
    proposedEntryType: careerEntryType("proposed_entry_type").notNull(),
    proposedEntryTitle: text("proposed_entry_title").notNull(),
    factType: evidenceFactType("fact_type").notNull(),
    proposedValue: jsonb("proposed_value").$type<EvidenceValue>().notNull(),
    displayText: text("display_text").notNull(),
    sourceLocator: jsonb("source_locator")
      .$type<SourceLocatorValue>()
      .notNull(),
    status: factProposalStatus("status").default("pending").notNull(),
    duplicateOfFactId: uuid("duplicate_of_fact_id"),
    approvedFactId: uuid("approved_fact_id"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    revision: integer("revision").default(1).notNull(),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("extraction_proposals_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    index("extraction_proposals_batch_status_idx").on(
      table.batchId,
      table.status,
      table.createdAt,
    ),
    foreignKey({
      name: "extraction_proposals_batch_workspace_fk",
      columns: [table.batchId, table.workspaceId],
      foreignColumns: [extractionBatches.id, extractionBatches.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "extraction_proposals_source_workspace_fk",
      columns: [table.sourceDocumentId, table.workspaceId],
      foreignColumns: [sourceDocuments.id, sourceDocuments.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "extraction_proposals_target_entry_workspace_fk",
      columns: [table.targetCareerEntryId, table.workspaceId],
      foreignColumns: [careerEntries.id, careerEntries.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "extraction_proposals_duplicate_fact_workspace_fk",
      columns: [table.duplicateOfFactId, table.workspaceId],
      foreignColumns: [evidenceFacts.id, evidenceFacts.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "extraction_proposals_approved_fact_workspace_fk",
      columns: [table.approvedFactId, table.workspaceId],
      foreignColumns: [evidenceFacts.id, evidenceFacts.workspaceId],
    }).onDelete("restrict"),
    check(
      "extraction_proposals_value_object",
      sql`jsonb_typeof(${table.proposedValue}) = 'object'`,
    ),
    check(
      "extraction_proposals_locator_object",
      sql`jsonb_typeof(${table.sourceLocator}) = 'object'`,
    ),
    check("extraction_proposals_revision_positive", sql`${table.revision} > 0`),
    check(
      "extraction_proposals_resolution_pair",
      sql`(${table.resolvedAt} IS NULL) = (${table.resolvedByUserId} IS NULL)`,
    ),
    check(
      "extraction_proposals_resolution_state",
      sql`(${table.status} = 'pending' AND ${table.resolvedAt} IS NULL AND ${table.approvedFactId} IS NULL)
          OR (${table.status} = 'rejected' AND ${table.resolvedAt} IS NOT NULL AND ${table.approvedFactId} IS NULL)
          OR (${table.status} IN ('approved', 'merged') AND ${table.resolvedAt} IS NOT NULL AND ${table.approvedFactId} IS NOT NULL)`,
    ),
  ],
);
