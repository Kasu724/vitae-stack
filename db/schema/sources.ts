import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigint,
} from "drizzle-orm/pg-core";

import { mutableTimestamps } from "./common";
import { users, workspaces } from "./identity";

export const sourceDocumentPurpose = pgEnum("source_document_purpose", [
  "resume",
  "cover_letter",
  "job_description",
  "career_evidence",
  "project_import",
]);
export const sourceDocumentStatus = pgEnum("source_document_status", [
  "quarantined",
  "processing",
  "ready",
  "rejected",
  "deleted",
]);

export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    purpose: sourceDocumentPurpose("purpose").notNull(),
    originalName: text("original_name").notNull(),
    declaredMediaType: text("declared_media_type").notNull(),
    detectedMediaType: text("detected_media_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    contentHash: text("content_hash").notNull(),
    storageKey: text("storage_key").notNull(),
    status: sourceDocumentStatus("status").default("quarantined").notNull(),
    extractedText: text("extracted_text"),
    parseMetadata: jsonb("parse_metadata")
      .$type<{
        pageCount?: number;
        paragraphCount?: number;
        schemaVersion: 1;
      }>()
      .default({ schemaVersion: 1 })
      .notNull(),
    warnings: text("warnings")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    parserVersion: text("parser_version"),
    errorCode: text("error_code"),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "date",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("source_documents_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("source_documents_storage_key_unique").on(table.storageKey),
    index("source_documents_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    check("source_documents_size_positive", sql`${table.byteSize} > 0`),
    check(
      "source_documents_hash_format",
      sql`${table.contentHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    check(
      "source_documents_metadata_object",
      sql`jsonb_typeof(${table.parseMetadata}) = 'object'`,
    ),
  ],
);
