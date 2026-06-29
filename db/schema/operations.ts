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

export const jobOperationState = pgEnum("job_operation_state", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const auditOutcome = pgEnum("audit_outcome", [
  "succeeded",
  "denied",
  "failed",
]);

export const jobOperations = pgTable(
  "job_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    operationType: text("operation_type").notNull(),
    state: jobOperationState("state").default("pending").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    inputHash: text("input_hash").notNull(),
    attempt: integer("attempt").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    availableAt: timestamp("available_at", {
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
    errorCode: text("error_code"),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("job_operations_workspace_idempotency_unique").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    uniqueIndex("job_operations_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    index("job_operations_queue_idx").on(
      table.state,
      table.availableAt,
      table.createdAt,
    ),
    check(
      "job_operations_attempt_bounds",
      sql`${table.attempt} >= 0 AND ${table.maxAttempts} > 0 AND ${table.attempt} <= ${table.maxAttempts}`,
    ),
    check(
      "job_operations_lease_pair",
      sql`(${table.leaseOwner} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    jobOperationId: uuid("job_operation_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    outcome: auditOutcome("outcome").notNull(),
    correlationId: text("correlation_id").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, boolean | number | string | null>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_events_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("audit_events_correlation_idx").on(table.correlationId),
    foreignKey({
      name: "audit_events_job_operation_workspace_fk",
      columns: [table.jobOperationId, table.workspaceId],
      foreignColumns: [jobOperations.id, jobOperations.workspaceId],
    }).onDelete("restrict"),
    check(
      "audit_events_metadata_object",
      sql`jsonb_typeof(${table.metadata}) = 'object'`,
    ),
  ],
);
