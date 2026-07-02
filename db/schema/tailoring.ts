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

import { careerEntries, evidenceFacts } from "./career";
import { documentVersions, documents } from "./documents";
import {
  jobPostingRevisions,
  jobRequirements,
  jobRequirementSets,
} from "./jobs";
import { requirementMatchRuns } from "./matching";
import { modelProviderConfigurations } from "./providers";
import { users, workspaces } from "./identity";

export const tailoringKind = pgEnum("tailoring_kind", [
  "resume",
  "cover_letter",
]);
export const tailoringRunStatus = pgEnum("tailoring_run_status", [
  "generating",
  "ready",
  "failed",
  "completed",
  "discarded",
]);
export const tailoringSuggestionOperation = pgEnum(
  "tailoring_suggestion_operation",
  ["replace_block_text", "add_block_after", "remove_block"],
);
export const tailoringSuggestionStatus = pgEnum("tailoring_suggestion_status", [
  "pending",
  "blocked",
  "accepted",
  "rejected",
]);
export const tailoringClaimRelation = pgEnum("tailoring_claim_relation", [
  "direct",
  "combines",
  "paraphrases",
]);

export interface TailoringRunManifest {
  schemaVersion: 1;
  inputHash: string;
  baseContentHash: string;
  jobContentHash: string;
  taskVersions: string[];
  promptPolicyVersion: string;
  selectedTone: "direct" | "formal" | "warm";
  targetLength: "concise" | "standard";
  lockedBlockIds: string[];
  lockedHashes: Array<{
    targetType: "block" | "claim" | "fact" | "section";
    targetId: string;
    hash: string;
  }>;
}

export interface TailoringTaskUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export const tailoringRuns = pgTable(
  "tailoring_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: tailoringKind("kind").notNull(),
    documentId: uuid("document_id").notNull(),
    baseVersionId: uuid("base_version_id").notNull(),
    jobPostingRevisionId: uuid("job_posting_revision_id").notNull(),
    requirementSetId: uuid("requirement_set_id").notNull(),
    matchRunId: uuid("match_run_id").notNull(),
    providerConfigurationId: uuid("provider_configuration_id"),
    model: text("model"),
    status: tailoringRunStatus("status").default("generating").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    manifest: jsonb("manifest").$type<TailoringRunManifest>().notNull(),
    failureCode: text("failure_code"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("tailoring_runs_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("tailoring_runs_idempotency_unique").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("tailoring_runs_workspace_status_created_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    foreignKey({
      name: "tailoring_runs_document_workspace_fk",
      columns: [table.documentId, table.workspaceId],
      foreignColumns: [documents.id, documents.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "tailoring_runs_base_version_workspace_fk",
      columns: [table.baseVersionId, table.workspaceId],
      foreignColumns: [documentVersions.id, documentVersions.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "tailoring_runs_job_revision_workspace_fk",
      columns: [table.jobPostingRevisionId, table.workspaceId],
      foreignColumns: [jobPostingRevisions.id, jobPostingRevisions.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "tailoring_runs_requirement_set_workspace_fk",
      columns: [table.requirementSetId, table.workspaceId],
      foreignColumns: [jobRequirementSets.id, jobRequirementSets.workspaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "tailoring_runs_match_context_fk",
      columns: [table.matchRunId, table.workspaceId, table.requirementSetId],
      foreignColumns: [
        requirementMatchRuns.id,
        requirementMatchRuns.workspaceId,
        requirementMatchRuns.requirementSetId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "tailoring_runs_provider_workspace_fk",
      columns: [table.providerConfigurationId, table.workspaceId],
      foreignColumns: [
        modelProviderConfigurations.id,
        modelProviderConfigurations.workspaceId,
      ],
    }).onDelete("restrict"),
    check(
      "tailoring_runs_manifest_object",
      sql`jsonb_typeof(${table.manifest}) = 'object'`,
    ),
    check(
      "tailoring_runs_terminal_state",
      sql`(${table.status} IN ('generating','ready') AND ${table.completedAt} IS NULL AND ${table.failureCode} IS NULL)
          OR (${table.status} IN ('completed','discarded') AND ${table.completedAt} IS NOT NULL AND ${table.failureCode} IS NULL)
          OR (${table.status} = 'failed' AND ${table.completedAt} IS NOT NULL AND ${table.failureCode} IS NOT NULL)`,
    ),
    check(
      "tailoring_runs_provider_model_pair",
      sql`(${table.providerConfigurationId} IS NULL) = (${table.model} IS NULL)`,
    ),
  ],
);

export const tailoringRunEntries = pgTable(
  "tailoring_run_entries",
  {
    workspaceId: uuid("workspace_id").notNull(),
    runId: uuid("run_id").notNull(),
    careerEntryId: uuid("career_entry_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.careerEntryId] }),
    foreignKey({
      name: "tailoring_run_entries_run_workspace_fk",
      columns: [table.runId, table.workspaceId],
      foreignColumns: [tailoringRuns.id, tailoringRuns.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "tailoring_run_entries_entry_workspace_fk",
      columns: [table.careerEntryId, table.workspaceId],
      foreignColumns: [careerEntries.id, careerEntries.workspaceId],
    }).onDelete("restrict"),
  ],
);

export const tailoringRunEvidence = pgTable(
  "tailoring_run_evidence",
  {
    workspaceId: uuid("workspace_id").notNull(),
    runId: uuid("run_id").notNull(),
    evidenceFactId: uuid("evidence_fact_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.evidenceFactId] }),
    foreignKey({
      name: "tailoring_run_evidence_run_workspace_fk",
      columns: [table.runId, table.workspaceId],
      foreignColumns: [tailoringRuns.id, tailoringRuns.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "tailoring_run_evidence_fact_workspace_fk",
      columns: [table.evidenceFactId, table.workspaceId],
      foreignColumns: [evidenceFacts.id, evidenceFacts.workspaceId],
    }).onDelete("restrict"),
  ],
);

export const tailoringSuggestions = pgTable(
  "tailoring_suggestions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    runId: uuid("run_id").notNull(),
    sequence: integer("sequence").notNull(),
    operation: tailoringSuggestionOperation("operation").notNull(),
    targetSectionId: uuid("target_section_id").notNull(),
    targetBlockId: uuid("target_block_id"),
    baseBlockHash: text("base_block_hash"),
    beforeText: text("before_text"),
    afterText: text("after_text"),
    rationale: text("rationale").notNull(),
    taskId: text("task_id").notNull(),
    taskVersion: text("task_version").notNull(),
    status: tailoringSuggestionStatus("status").default("pending").notNull(),
    blockedCode: text("blocked_code"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
    acceptedVersionId: uuid("accepted_version_id"),
    editedTextHash: text("edited_text_hash"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("tailoring_suggestions_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("tailoring_suggestions_run_sequence_unique").on(
      table.runId,
      table.sequence,
    ),
    index("tailoring_suggestions_run_status_idx").on(table.runId, table.status),
    foreignKey({
      name: "tailoring_suggestions_run_workspace_fk",
      columns: [table.runId, table.workspaceId],
      foreignColumns: [tailoringRuns.id, tailoringRuns.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "tailoring_suggestions_version_workspace_fk",
      columns: [table.acceptedVersionId, table.workspaceId],
      foreignColumns: [documentVersions.id, documentVersions.workspaceId],
    }).onDelete("restrict"),
    check(
      "tailoring_suggestions_replace_fields",
      sql`(${table.operation} <> 'replace_block_text') OR (${table.targetBlockId} IS NOT NULL AND ${table.baseBlockHash} IS NOT NULL AND ${table.beforeText} IS NOT NULL AND ${table.afterText} IS NOT NULL)`,
    ),
    check(
      "tailoring_suggestions_blocked_pair",
      sql`(${table.status} = 'blocked') = (${table.blockedCode} IS NOT NULL)`,
    ),
    check(
      "tailoring_suggestions_decision_state",
      sql`(${table.status} IN ('pending','blocked') AND ${table.decidedAt} IS NULL AND ${table.decidedByUserId} IS NULL AND ${table.acceptedVersionId} IS NULL)
          OR (${table.status} = 'accepted' AND ${table.decidedAt} IS NOT NULL AND ${table.acceptedVersionId} IS NOT NULL)
          OR (${table.status} = 'rejected' AND ${table.decidedAt} IS NOT NULL AND ${table.acceptedVersionId} IS NULL)`,
    ),
    check(
      "tailoring_suggestions_edited_hash",
      sql`${table.editedTextHash} IS NULL OR ${table.editedTextHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
  ],
);

export const tailoringSuggestionRequirements = pgTable(
  "tailoring_suggestion_requirements",
  {
    workspaceId: uuid("workspace_id").notNull(),
    suggestionId: uuid("suggestion_id").notNull(),
    requirementId: uuid("requirement_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.suggestionId, table.requirementId] }),
    foreignKey({
      name: "tailoring_suggestion_requirements_suggestion_workspace_fk",
      columns: [table.suggestionId, table.workspaceId],
      foreignColumns: [
        tailoringSuggestions.id,
        tailoringSuggestions.workspaceId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "tailoring_suggestion_requirements_requirement_workspace_fk",
      columns: [table.requirementId, table.workspaceId],
      foreignColumns: [jobRequirements.id, jobRequirements.workspaceId],
    }).onDelete("restrict"),
  ],
);

export const tailoringClaimCandidates = pgTable(
  "tailoring_claim_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    suggestionId: uuid("suggestion_id").notNull(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    textHash: text("text_hash").notNull(),
    relation: tailoringClaimRelation("relation").notNull(),
  },
  (table) => [
    uniqueIndex("tailoring_claim_candidates_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    index("tailoring_claim_candidates_suggestion_idx").on(table.suggestionId),
    foreignKey({
      name: "tailoring_claim_candidates_suggestion_workspace_fk",
      columns: [table.suggestionId, table.workspaceId],
      foreignColumns: [
        tailoringSuggestions.id,
        tailoringSuggestions.workspaceId,
      ],
    }).onDelete("cascade"),
    check(
      "tailoring_claim_candidates_offset_bounds",
      sql`${table.startOffset} >= 0 AND ${table.endOffset} > ${table.startOffset}`,
    ),
  ],
);

export const tailoringClaimEvidence = pgTable(
  "tailoring_claim_evidence",
  {
    workspaceId: uuid("workspace_id").notNull(),
    claimCandidateId: uuid("claim_candidate_id").notNull(),
    evidenceFactId: uuid("evidence_fact_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.claimCandidateId, table.evidenceFactId] }),
    foreignKey({
      name: "tailoring_claim_evidence_claim_workspace_fk",
      columns: [table.claimCandidateId, table.workspaceId],
      foreignColumns: [
        tailoringClaimCandidates.id,
        tailoringClaimCandidates.workspaceId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "tailoring_claim_evidence_fact_workspace_fk",
      columns: [table.evidenceFactId, table.workspaceId],
      foreignColumns: [evidenceFacts.id, evidenceFacts.workspaceId],
    }).onDelete("restrict"),
  ],
);

export const tailoringGaps = pgTable(
  "tailoring_gaps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    runId: uuid("run_id").notNull(),
    requirementId: uuid("requirement_id").notNull(),
    code: text("code").notNull(),
    detail: text("detail").notNull(),
  },
  (table) => [
    uniqueIndex("tailoring_gaps_run_requirement_unique").on(
      table.runId,
      table.requirementId,
      table.code,
    ),
    foreignKey({
      name: "tailoring_gaps_run_workspace_fk",
      columns: [table.runId, table.workspaceId],
      foreignColumns: [tailoringRuns.id, tailoringRuns.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "tailoring_gaps_requirement_workspace_fk",
      columns: [table.requirementId, table.workspaceId],
      foreignColumns: [jobRequirements.id, jobRequirements.workspaceId],
    }).onDelete("restrict"),
  ],
);

export const tailoringTaskResults = pgTable(
  "tailoring_task_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    runId: uuid("run_id").notNull(),
    sequence: integer("sequence").notNull(),
    taskId: text("task_id").notNull(),
    taskVersion: text("task_version").notNull(),
    providerKind: text("provider_kind").notNull(),
    model: text("model").notNull(),
    attempts: integer("attempts").notNull(),
    inputHash: text("input_hash").notNull(),
    outputHash: text("output_hash").notNull(),
    usage: jsonb("usage").$type<TailoringTaskUsage>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("tailoring_task_results_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
    uniqueIndex("tailoring_task_results_run_sequence_unique").on(
      table.runId,
      table.sequence,
    ),
    foreignKey({
      name: "tailoring_task_results_run_workspace_fk",
      columns: [table.runId, table.workspaceId],
      foreignColumns: [tailoringRuns.id, tailoringRuns.workspaceId],
    }).onDelete("cascade"),
    check(
      "tailoring_task_results_attempts_positive",
      sql`${table.attempts} > 0`,
    ),
    check(
      "tailoring_task_results_hashes",
      sql`${table.inputHash} ~ '^sha256:[0-9a-f]{64}$' AND ${table.outputHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    check(
      "tailoring_task_results_objects",
      sql`jsonb_typeof(${table.usage}) = 'object' AND jsonb_typeof(${table.result}) = 'object'`,
    ),
  ],
);
