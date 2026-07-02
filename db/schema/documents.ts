import { sql } from "drizzle-orm";
import {
  check,
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
import { evidenceFacts } from "./career";
import { mutableTimestamps } from "./common";
import { users } from "./identity";

export const documentKind = pgEnum("document_kind", ["resume", "cover_letter"]);
export const documentStatus = pgEnum("document_status", ["active", "archived"]);
export const versionReason = pgEnum("document_version_reason", [
  "initial",
  "manual_save",
  "restore",
  "import",
  "tailoring",
  "suggestion_batch",
]);
export const claimStatus = pgEnum("generated_claim_status", [
  "supported",
  "unverified",
  "nonfactual",
]);
export const documentLockTarget = pgEnum("document_lock_target", [
  "section",
  "block",
  "claim",
  "fact",
]);

export interface CanonicalDocumentValue {
  schemaVersion: 1;
  kind: "resume" | "cover_letter";
  sections: Array<{
    id: string;
    type: string;
    heading?: string;
    blocks: Array<{ id: string; type: string; text: string }>;
  }>;
}

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    careerProfileId: uuid("career_profile_id").notNull(),
    kind: documentKind("kind").notNull(),
    title: text("title").notNull(),
    status: documentStatus("status").default("active").notNull(),
    currentVersionId: uuid("current_version_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    revision: integer("revision").default(1).notNull(),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("documents_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    index("documents_workspace_kind_status_idx").on(
      table.workspaceId,
      table.kind,
      table.status,
    ),
    foreignKey({
      name: "documents_profile_workspace_fk",
      columns: [table.careerProfileId, table.workspaceId],
      foreignColumns: [careerProfiles.id, careerProfiles.workspaceId],
    }).onDelete("cascade"),
    check("documents_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    parentVersionId: uuid("parent_version_id"),
    restoredFromVersionId: uuid("restored_from_version_id"),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: versionReason("reason").notNull(),
    schemaVersion: integer("schema_version").default(1).notNull(),
    content: jsonb("content").$type<CanonicalDocumentValue>().notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("document_versions_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    index("document_versions_document_hash_idx").on(
      table.documentId,
      table.contentHash,
    ),
    index("document_versions_document_created_idx").on(
      table.documentId,
      table.createdAt,
    ),
    foreignKey({
      name: "document_versions_document_workspace_fk",
      columns: [table.documentId, table.workspaceId],
      foreignColumns: [documents.id, documents.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "document_versions_parent_workspace_fk",
      columns: [table.parentVersionId, table.workspaceId],
      foreignColumns: [table.id, table.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "document_versions_restore_workspace_fk",
      columns: [table.restoredFromVersionId, table.workspaceId],
      foreignColumns: [table.id, table.workspaceId],
    }).onDelete("restrict"),
    check("document_versions_schema_positive", sql`${table.schemaVersion} > 0`),
    check(
      "document_versions_content_object",
      sql`jsonb_typeof(${table.content}) = 'object'`,
    ),
    check(
      "document_versions_hash_format",
      sql`${table.contentHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
  ],
);

export const documentSections = pgTable(
  "document_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    versionId: uuid("version_id").notNull(),
    stableSectionId: uuid("stable_section_id").notNull(),
    sectionType: text("section_type").notNull(),
    heading: text("heading"),
    position: integer("position").notNull(),
    contentHash: text("content_hash").notNull(),
  },
  (table) => [
    uniqueIndex("document_sections_version_stable_unique").on(
      table.versionId,
      table.stableSectionId,
    ),
    uniqueIndex("document_sections_version_position_unique").on(
      table.versionId,
      table.position,
    ),
    foreignKey({
      name: "document_sections_version_workspace_fk",
      columns: [table.versionId, table.workspaceId],
      foreignColumns: [documentVersions.id, documentVersions.workspaceId],
    }).onDelete("cascade"),
    check(
      "document_sections_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
  ],
);

export const documentDrafts = pgTable(
  "document_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    baseVersionId: uuid("base_version_id").notNull(),
    content: jsonb("content").$type<CanonicalDocumentValue>().notNull(),
    revision: integer("revision").default(1).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("document_drafts_document_user_unique").on(
      table.documentId,
      table.userId,
    ),
    foreignKey({
      name: "document_drafts_document_workspace_fk",
      columns: [table.documentId, table.workspaceId],
      foreignColumns: [documents.id, documents.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "document_drafts_base_workspace_fk",
      columns: [table.baseVersionId, table.workspaceId],
      foreignColumns: [documentVersions.id, documentVersions.workspaceId],
    }).onDelete("cascade"),
    check("document_drafts_revision_positive", sql`${table.revision} > 0`),
    check(
      "document_drafts_content_object",
      sql`jsonb_typeof(${table.content}) = 'object'`,
    ),
  ],
);

export const generatedClaims = pgTable(
  "generated_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    versionId: uuid("version_id").notNull(),
    stableBlockId: uuid("stable_block_id").notNull(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    textHash: text("text_hash").notNull(),
    status: claimStatus("status").notNull(),
    sourceClaimId: uuid("source_claim_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("generated_claims_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    index("generated_claims_version_status_idx").on(
      table.versionId,
      table.status,
    ),
    foreignKey({
      name: "generated_claims_version_workspace_fk",
      columns: [table.versionId, table.workspaceId],
      foreignColumns: [documentVersions.id, documentVersions.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "generated_claims_source_workspace_fk",
      columns: [table.sourceClaimId, table.workspaceId],
      foreignColumns: [table.id, table.workspaceId],
    }).onDelete("restrict"),
    check(
      "generated_claims_offset_bounds",
      sql`${table.startOffset} >= 0 AND ${table.endOffset} > ${table.startOffset}`,
    ),
  ],
);

export const claimEvidence = pgTable(
  "claim_evidence",
  {
    workspaceId: uuid("workspace_id").notNull(),
    claimId: uuid("claim_id").notNull(),
    evidenceFactId: uuid("evidence_fact_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "claim_evidence_pk",
      columns: [table.claimId, table.evidenceFactId],
    }),
    foreignKey({
      name: "claim_evidence_claim_workspace_fk",
      columns: [table.claimId, table.workspaceId],
      foreignColumns: [generatedClaims.id, generatedClaims.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "claim_evidence_fact_workspace_fk",
      columns: [table.evidenceFactId, table.workspaceId],
      foreignColumns: [evidenceFacts.id, evidenceFacts.workspaceId],
    }).onDelete("restrict"),
  ],
);

export const documentLocks = pgTable(
  "document_locks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    targetType: documentLockTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    lockedHash: text("locked_hash").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("document_locks_target_unique").on(
      table.documentId,
      table.targetType,
      table.targetId,
    ),
    foreignKey({
      name: "document_locks_document_workspace_fk",
      columns: [table.documentId, table.workspaceId],
      foreignColumns: [documents.id, documents.workspaceId],
    }).onDelete("cascade"),
  ],
);
