import { sql } from "drizzle-orm";
import {
  check,
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

export const workspaceDeletionState = pgEnum("workspace_deletion_state", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);

/**
 * Deliberately has no workspace/user FK: this content-free receipt must survive
 * deletion of the aggregate and account that requested it.
 */
export const workspaceDeletionOperations = pgTable(
  "workspace_deletion_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    requesterUserHash: text("requester_user_hash").notNull(),
    state: workspaceDeletionState("state").default("pending").notNull(),
    attempt: integer("attempt").default(0).notNull(),
    backupExpiresAt: timestamp("backup_expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    deletedCounts: jsonb("deleted_counts")
      .$type<Record<string, number>>()
      .default({})
      .notNull(),
    errorCode: text("error_code"),
    requestedAt: timestamp("requested_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("workspace_deletion_operations_workspace_unique").on(
      table.workspaceId,
    ),
    index("workspace_deletion_operations_queue_idx").on(
      table.state,
      table.requestedAt,
    ),
    check(
      "workspace_deletion_operations_attempt_nonnegative",
      sql`${table.attempt} >= 0`,
    ),
    check(
      "workspace_deletion_operations_counts_object",
      sql`jsonb_typeof(${table.deletedCounts}) = 'object'`,
    ),
    check(
      "workspace_deletion_operations_backup_window",
      sql`${table.backupExpiresAt} <= ${table.requestedAt} + interval '30 days'`,
    ),
  ],
);
