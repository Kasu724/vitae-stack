import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { documentVersions } from "./documents";
import { users, workspaces } from "./identity";

export const exportFormat = pgEnum("export_format", [
  "pdf",
  "docx",
  "markdown",
  "text",
  "json",
]);
export const exportClassification = pgEnum("export_classification", [
  "final",
  "draft",
]);

export interface ExportManifestValue {
  schemaVersion: 1;
  templateId: "ats-safe-single-column@1";
  rendererVersion: string;
  sourceDocumentHash: string;
  unsupportedClaimIds: string[];
  warnings: string[];
}

export const exportArtifacts = pgTable(
  "export_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id").notNull(),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    format: exportFormat("format").notNull(),
    classification: exportClassification("classification").notNull(),
    mediaType: text("media_type").notNull(),
    filename: text("filename").notNull(),
    storageKey: text("storage_key").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    contentHash: text("content_hash").notNull(),
    inputHash: text("input_hash").notNull(),
    manifest: jsonb("manifest").$type<ExportManifestValue>().notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("export_artifacts_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("export_artifacts_workspace_input_unique").on(
      table.workspaceId,
      table.inputHash,
    ),
    uniqueIndex("export_artifacts_storage_key_unique").on(table.storageKey),
    index("export_artifacts_workspace_expiry_idx").on(
      table.workspaceId,
      table.expiresAt,
    ),
    foreignKey({
      name: "export_artifacts_version_workspace_fk",
      columns: [table.documentVersionId, table.workspaceId],
      foreignColumns: [documentVersions.id, documentVersions.workspaceId],
    }).onDelete("cascade"),
    check(
      "export_artifacts_hashes",
      sql`${table.contentHash} ~ '^sha256:[0-9a-f]{64}$' AND ${table.inputHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    check(
      "export_artifacts_size_bounds",
      sql`${table.byteSize} > 0 AND ${table.byteSize} <= 10485760`,
    ),
    check(
      "export_artifacts_filename_safe",
      sql`length(${table.filename}) BETWEEN 1 AND 180 AND position('/' in ${table.filename})=0 AND position(chr(92) in ${table.filename})=0 AND position(chr(10) in ${table.filename})=0 AND position(chr(13) in ${table.filename})=0`,
    ),
    check(
      "export_artifacts_manifest_object",
      sql`jsonb_typeof(${table.manifest})='object'`,
    ),
    check(
      "export_artifacts_draft_format",
      sql`${table.classification}='final' OR ${table.format} IN ('markdown','text','json')`,
    ),
    check(
      "export_artifacts_expiry_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);
