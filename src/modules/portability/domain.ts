import { createHash } from "node:crypto";

import { z } from "zod";

export const PORTABILITY_SCHEMA_VERSION = 1 as const;
export const PORTABILITY_MAX_BYTES = 50 * 1024 * 1024;

/** FK-safe order. Local identity, credentials, audit events, rate limits,
 * ephemeral jobs, and deletion receipts are intentionally excluded. */
export const PORTABLE_TABLES = [
  "career_profiles",
  "job_postings",
  "model_provider_configurations",
  "skills",
  "source_documents",
  "career_entries",
  "career_profile_settings",
  "documents",
  "job_posting_revisions",
  "document_locks",
  "document_versions",
  "evidence_facts",
  "extraction_batches",
  "job_requirement_sets",
  "ats_reports",
  "career_entry_skills",
  "document_drafts",
  "document_sections",
  "export_artifacts",
  "extraction_proposals",
  "fact_proposals",
  "generated_claims",
  "job_requirements",
  "requirement_match_runs",
  "ats_category_scores",
  "ats_findings",
  "claim_evidence",
  "requirement_evidence_matches",
  "tailoring_runs",
  "requirement_evidence_decisions",
  "tailoring_gaps",
  "tailoring_run_entries",
  "tailoring_run_evidence",
  "tailoring_suggestions",
  "tailoring_task_results",
  "tailoring_claim_candidates",
  "tailoring_suggestion_requirements",
  "tailoring_claim_evidence",
] as const;

export type PortableTable = (typeof PORTABLE_TABLES)[number];

const portableRowSchema = z.record(z.string(), z.unknown());
const blobSchema = z.object({
  kind: z.enum(["source", "export"]),
  resourceId: z.string().uuid(),
  mediaType: z.string().min(1).max(200),
  byteSize: z.number().int().positive().max(PORTABILITY_MAX_BYTES),
  contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  dataBase64: z.string().min(1),
});

export const portabilityArchiveSchema = z
  .object({
    schemaVersion: z.literal(PORTABILITY_SCHEMA_VERSION),
    product: z.literal("vitae-stack"),
    exportedAt: z.iso.datetime(),
    sourceWorkspaceId: z.string().uuid(),
    options: z.object({ sources: z.boolean(), artifacts: z.boolean() }),
    tables: z.record(z.string(), z.array(portableRowSchema).max(100_000)),
    blobs: z.array(blobSchema).max(10_000),
    warnings: z.array(z.string().max(300)).max(100),
  })
  .superRefine((archive, context) => {
    const allowed = new Set<string>(PORTABLE_TABLES);
    for (const key of Object.keys(archive.tables)) {
      if (!allowed.has(key))
        context.addIssue({
          code: "custom",
          path: ["tables", key],
          message: "Archive contains an unsupported table.",
        });
    }
    for (const table of PORTABLE_TABLES) {
      if (!archive.tables[table])
        context.addIssue({
          code: "custom",
          path: ["tables", table],
          message: "Archive is missing a required table collection.",
        });
    }
  });

export type PortabilityArchive = z.infer<typeof portabilityArchiveSchema>;

export interface PortabilityPreview {
  schemaVersion: 1;
  sourceWorkspaceId: string;
  tableCounts: Record<string, number>;
  existingRecordCount: number;
  identifierConflictCount: number;
  secretFieldCount: number;
  sourceBlobCount: number;
  artifactBlobCount: number;
  canApply: boolean;
  reasons: string[];
}

export function sha256(bytes: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export const forbiddenPortableFields = new Set([
  "credential_ciphertext",
  "credential_nonce",
  "credential_tag",
  "credential_key_version",
  "credential_last_four",
  "environment_variable_name",
  "password",
  "access_token",
  "refresh_token",
  "id_token",
  "token",
]);

export function countForbiddenFields(value: unknown): number {
  if (Array.isArray(value))
    return value.reduce((count, item) => count + countForbiddenFields(item), 0);
  if (!value || typeof value !== "object") return 0;
  return Object.entries(value).reduce(
    (count, [key, item]) =>
      count +
      (forbiddenPortableFields.has(key) && item !== null ? 1 : 0) +
      countForbiddenFields(item),
    0,
  );
}
