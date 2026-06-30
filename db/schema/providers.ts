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

import { mutableTimestamps } from "./common";
import { users, workspaces } from "./identity";

export const modelProviderKind = pgEnum("model_provider_kind", [
  "openai_compatible",
  "ollama",
]);
export const modelProviderAuthType = pgEnum("model_provider_auth_type", [
  "none",
  "encrypted",
  "environment",
]);
export const modelProviderStatus = pgEnum("model_provider_status", [
  "unverified",
  "available",
  "unavailable",
  "disabled",
]);

export interface ModelProviderCapabilities {
  schemaVersion: 1;
  structuredOutput: boolean;
  usage: boolean;
  refusal: boolean;
  testedAt?: string;
  warnings: string[];
}

export type ModelTaskAssignments = Partial<Record<`AI-${string}`, string>>;

export const modelProviderConfigurations = pgTable(
  "model_provider_configurations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: modelProviderKind("kind").notNull(),
    label: text("label").notNull(),
    baseUrl: text("base_url").notNull(),
    authType: modelProviderAuthType("auth_type").default("none").notNull(),
    credentialCiphertext: text("credential_ciphertext"),
    credentialNonce: text("credential_nonce"),
    credentialTag: text("credential_tag"),
    credentialKeyVersion: integer("credential_key_version"),
    credentialLastFour: text("credential_last_four"),
    environmentVariableName: text("environment_variable_name"),
    capabilities: jsonb("capabilities")
      .$type<ModelProviderCapabilities>()
      .default({
        schemaVersion: 1,
        structuredOutput: false,
        usage: false,
        refusal: false,
        warnings: [],
      })
      .notNull(),
    taskAssignments: jsonb("task_assignments")
      .$type<ModelTaskAssignments>()
      .default({})
      .notNull(),
    status: modelProviderStatus("status").default("unverified").notNull(),
    lastTestedAt: timestamp("last_tested_at", {
      withTimezone: true,
      mode: "date",
    }),
    revision: integer("revision").default(1).notNull(),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("model_provider_configurations_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("model_provider_configurations_workspace_label_unique").on(
      table.workspaceId,
      table.label,
    ),
    index("model_provider_configurations_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    check(
      "model_provider_configurations_credential_pair",
      sql`(${table.authType} = 'encrypted' AND ${table.credentialCiphertext} IS NOT NULL AND ${table.credentialNonce} IS NOT NULL AND ${table.credentialTag} IS NOT NULL AND ${table.credentialKeyVersion} IS NOT NULL AND ${table.credentialLastFour} IS NOT NULL AND ${table.environmentVariableName} IS NULL)
          OR (${table.authType} = 'environment' AND ${table.credentialCiphertext} IS NULL AND ${table.credentialNonce} IS NULL AND ${table.credentialTag} IS NULL AND ${table.credentialKeyVersion} IS NULL AND ${table.credentialLastFour} IS NULL AND ${table.environmentVariableName} IS NOT NULL)
          OR (${table.authType} = 'none' AND ${table.credentialCiphertext} IS NULL AND ${table.credentialNonce} IS NULL AND ${table.credentialTag} IS NULL AND ${table.credentialKeyVersion} IS NULL AND ${table.credentialLastFour} IS NULL AND ${table.environmentVariableName} IS NULL)`,
    ),
    check(
      "model_provider_configurations_capabilities_object",
      sql`jsonb_typeof(${table.capabilities}) = 'object'`,
    ),
    check(
      "model_provider_configurations_assignments_object",
      sql`jsonb_typeof(${table.taskAssignments}) = 'object'`,
    ),
    check(
      "model_provider_configurations_revision_positive",
      sql`${table.revision} > 0`,
    ),
  ],
);
