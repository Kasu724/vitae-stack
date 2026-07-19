import {
  PORTABLE_TABLES,
  sha256,
  type PortabilityArchive,
  type PortableTable,
} from "./domain";

import {
  canonicalDocumentSchema,
  type CanonicalDocument,
} from "@/modules/documents/document-schema";
import {
  assessDocumentGrounding,
  GROUNDING_POLICY_VERSION,
  groundingStateHash,
  type DocumentGroundingClaim,
} from "@/modules/documents/grounding";
import { contentHash } from "@/modules/documents/hash";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const hashPattern = /^sha256:[0-9a-f]{64}$/u;

const entityTables = new Set<PortableTable>([
  "career_profiles",
  "job_postings",
  "model_provider_configurations",
  "skills",
  "source_documents",
  "career_entries",
  "documents",
  "job_posting_revisions",
  "document_locks",
  "document_versions",
  "evidence_facts",
  "extraction_batches",
  "job_requirement_sets",
  "ats_reports",
  "source_ats_reports",
  "document_drafts",
  "document_sections",
  "export_artifacts",
  "extraction_proposals",
  "fact_proposals",
  "generated_claims",
  "job_requirements",
  "requirement_match_runs",
  "ats_findings",
  "source_ats_findings",
  "requirement_evidence_matches",
  "tailoring_runs",
  "requirement_evidence_decisions",
  "tailoring_gaps",
  "tailoring_suggestions",
  "tailoring_task_results",
  "tailoring_claim_candidates",
]);

const compositeKeys = new Map<PortableTable, readonly string[]>([
  ["career_profile_settings", ["workspace_id", "career_profile_id"]],
  ["career_entry_skills", ["career_entry_id", "skill_id"]],
  ["claim_evidence", ["claim_id", "evidence_fact_id"]],
  ["ats_category_scores", ["report_id", "category"]],
  ["source_ats_category_scores", ["report_id", "category"]],
  ["tailoring_run_entries", ["run_id", "career_entry_id"]],
  ["tailoring_run_evidence", ["run_id", "evidence_fact_id"]],
  ["tailoring_suggestion_requirements", ["suggestion_id", "requirement_id"]],
  ["tailoring_claim_evidence", ["claim_candidate_id", "evidence_fact_id"]],
]);

const nonUuidIdentifierFields = new Set(["task_id", "rule_id"]);

export const INVALID_ARCHIVE_PROVENANCE_REASON =
  "The archive contains invalid document or artifact provenance.";

interface VersionState {
  contentHash: string;
  document: CanonicalDocument;
  claims: DocumentGroundingClaim[];
  unsupportedClaimIds: string[];
  groundingStateHash: string;
}

function stringField(
  row: Record<string, unknown>,
  field: string,
): string | null {
  return typeof row[field] === "string" ? row[field] : null;
}

function integerField(
  row: Record<string, unknown>,
  field: string,
): number | null {
  const value = row[field];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function recordField(
  row: Record<string, unknown>,
  field: string,
): Record<string, unknown> | null {
  const value = row[field];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function rows(
  archive: PortabilityArchive,
  table: keyof PortabilityArchive["tables"],
): Array<Record<string, unknown>> {
  return archive.tables[String(table)] ?? [];
}

function mapById(
  sourceRows: Array<Record<string, unknown>>,
  issues: Set<string>,
  issueCode: string,
): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const row of sourceRows) {
    const id = stringField(row, "id");
    if (!id || !uuidPattern.test(id) || result.has(id)) {
      issues.add(issueCode);
      continue;
    }
    result.set(id, row);
  }
  return result;
}

function validateIdentifiers(
  archive: PortabilityArchive,
  issues: Set<string>,
): void {
  for (const table of PORTABLE_TABLES) {
    const tableRows = rows(archive, table);
    const identifiers = new Set<string>();
    const compound = new Set<string>();
    for (const row of tableRows) {
      const id = row.id;
      if (entityTables.has(table)) {
        if (
          typeof id !== "string" ||
          !uuidPattern.test(id) ||
          identifiers.has(id)
        )
          issues.add("archive-identifier");
        else identifiers.add(id);
      }
      for (const [field, value] of Object.entries(row)) {
        if (
          value !== null &&
          value !== undefined &&
          (field === "id" || field.endsWith("_id")) &&
          !nonUuidIdentifierFields.has(field) &&
          (typeof value !== "string" || !uuidPattern.test(value))
        )
          issues.add("archive-identifier");
      }
      const keyFields = compositeKeys.get(table);
      if (keyFields) {
        const values = keyFields.map((field) => row[field]);
        if (values.some((value) => value === null || value === undefined)) {
          issues.add("archive-composite-key");
          continue;
        }
        const key = JSON.stringify(values);
        if (compound.has(key)) issues.add("archive-composite-key");
        compound.add(key);
      }
    }
  }
}

function detectsCycle(
  indexed: Map<string, Record<string, unknown>>,
  parentField: string,
): boolean {
  for (const id of indexed.keys()) {
    const visited = new Set<string>();
    let current: string | null = id;
    while (current) {
      if (visited.has(current)) return true;
      visited.add(current);
      const parent: unknown = indexed.get(current)?.[parentField];
      current = typeof parent === "string" ? parent : null;
    }
  }
  return false;
}

/**
 * Validates semantic relationships that the generic JSON envelope and later
 * database foreign keys cannot prove before filesystem blobs are written.
 * Returned codes are deliberately content-free.
 */
export function validateArchiveSemantics(
  archive: PortabilityArchive,
): string[] {
  const issues = new Set<string>();

  validateIdentifiers(archive, issues);

  for (const tableRows of Object.values(archive.tables))
    for (const row of tableRows)
      if (row.workspace_id !== archive.sourceWorkspaceId)
        issues.add("workspace-scope");

  if (rows(archive, "career_profiles").length !== 1)
    issues.add("profile-cardinality");

  const profiles = mapById(
    rows(archive, "career_profiles"),
    issues,
    "profile-identifier",
  );
  const sources = mapById(
    rows(archive, "source_documents"),
    issues,
    "source-identifier",
  );
  const skills = mapById(rows(archive, "skills"), issues, "skill-identifier");
  const providers = mapById(
    rows(archive, "model_provider_configurations"),
    issues,
    "provider-identifier",
  );
  const postings = mapById(
    rows(archive, "job_postings"),
    issues,
    "job-identifier",
  );
  const jobRevisions = mapById(
    rows(archive, "job_posting_revisions"),
    issues,
    "job-revision-identifier",
  );
  const requirementSets = mapById(
    rows(archive, "job_requirement_sets"),
    issues,
    "requirement-set-identifier",
  );
  const requirements = mapById(
    rows(archive, "job_requirements"),
    issues,
    "requirement-identifier",
  );
  const matchRuns = mapById(
    rows(archive, "requirement_match_runs"),
    issues,
    "match-run-identifier",
  );
  const matches = mapById(
    rows(archive, "requirement_evidence_matches"),
    issues,
    "match-identifier",
  );
  const tailoringRuns = mapById(
    rows(archive, "tailoring_runs"),
    issues,
    "tailoring-run-identifier",
  );
  const suggestions = mapById(
    rows(archive, "tailoring_suggestions"),
    issues,
    "suggestion-identifier",
  );
  const candidates = mapById(
    rows(archive, "tailoring_claim_candidates"),
    issues,
    "claim-candidate-identifier",
  );
  const atsReports = mapById(
    rows(archive, "ats_reports"),
    issues,
    "ats-report-identifier",
  );
  const sourceAtsReports = mapById(
    rows(archive, "source_ats_reports"),
    issues,
    "source-ats-report-identifier",
  );
  const extractionBatches = mapById(
    rows(archive, "extraction_batches"),
    issues,
    "extraction-batch-identifier",
  );
  const extractionProposals = mapById(
    rows(archive, "extraction_proposals"),
    issues,
    "extraction-proposal-identifier",
  );
  const factProposals = mapById(
    rows(archive, "fact_proposals"),
    issues,
    "fact-proposal-identifier",
  );
  const documentDrafts = mapById(
    rows(archive, "document_drafts"),
    issues,
    "document-draft-identifier",
  );
  const documentLocks = mapById(
    rows(archive, "document_locks"),
    issues,
    "document-lock-identifier",
  );

  const documents = mapById(
    rows(archive, "documents"),
    issues,
    "document-identifier",
  );
  const versionRows = mapById(
    rows(archive, "document_versions"),
    issues,
    "version-identifier",
  );
  const entries = mapById(
    rows(archive, "career_entries"),
    issues,
    "entry-identifier",
  );
  const facts = mapById(
    rows(archive, "evidence_facts"),
    issues,
    "fact-identifier",
  );
  const claimRows = mapById(
    rows(archive, "generated_claims"),
    issues,
    "claim-identifier",
  );

  for (const row of rows(archive, "career_profile_settings"))
    if (!profiles.has(stringField(row, "career_profile_id") ?? ""))
      issues.add("profile-settings-reference");
  for (const row of entries.values())
    if (!profiles.has(stringField(row, "career_profile_id") ?? ""))
      issues.add("career-entry-reference");
  for (const row of documents.values())
    if (!profiles.has(stringField(row, "career_profile_id") ?? ""))
      issues.add("document-profile-reference");

  for (const [sourceId, row] of sources)
    if (
      stringField(row, "storage_key") !==
        `${archive.sourceWorkspaceId}/${sourceId}.bin` ||
      !hashPattern.test(stringField(row, "content_hash") ?? "") ||
      (integerField(row, "byte_size") ?? 0) <= 0
    )
      issues.add("source-storage-identity");

  for (const [factId, row] of facts) {
    const entryId = stringField(row, "career_entry_id");
    const parentId = stringField(row, "supersedes_fact_id");
    if (!entryId || !entries.has(entryId)) issues.add("fact-entry-reference");
    if (parentId) {
      const parent = facts.get(parentId);
      if (
        factId === parentId ||
        !parent ||
        stringField(parent, "career_entry_id") !== entryId
      )
        issues.add("fact-history-context");
    }
  }
  if (detectsCycle(facts, "supersedes_fact_id"))
    issues.add("fact-history-context");

  for (const row of factProposals.values()) {
    const entryId = stringField(row, "career_entry_id");
    const approvedFactId = stringField(row, "approved_fact_id");
    if (!entryId || !entries.has(entryId))
      issues.add("fact-proposal-reference");
    if (
      approvedFactId &&
      stringField(facts.get(approvedFactId) ?? {}, "career_entry_id") !==
        entryId
    )
      issues.add("fact-proposal-context");
  }

  for (const row of rows(archive, "career_entry_skills")) {
    const entryId = stringField(row, "career_entry_id");
    const skillId = stringField(row, "skill_id");
    const factId = stringField(row, "evidence_fact_id");
    if (!entryId || !entries.has(entryId) || !skillId || !skills.has(skillId))
      issues.add("entry-skill-reference");
    if (
      factId &&
      stringField(facts.get(factId) ?? {}, "career_entry_id") !== entryId
    )
      issues.add("entry-skill-evidence-context");
  }

  for (const row of extractionBatches.values()) {
    const sourceId = stringField(row, "source_document_id");
    const targetId = stringField(row, "target_career_entry_id");
    if (!sourceId || !sources.has(sourceId))
      issues.add("extraction-batch-reference");
    if (targetId && !entries.has(targetId))
      issues.add("extraction-batch-reference");
  }
  for (const row of extractionProposals.values()) {
    const batch = extractionBatches.get(stringField(row, "batch_id") ?? "");
    const sourceId = stringField(row, "source_document_id");
    const targetId = stringField(row, "target_career_entry_id");
    if (
      !batch ||
      !sourceId ||
      !sources.has(sourceId) ||
      stringField(batch, "source_document_id") !== sourceId ||
      (targetId !== null && !entries.has(targetId))
    )
      issues.add("extraction-proposal-context");
    for (const field of ["duplicate_of_fact_id", "approved_fact_id"] as const) {
      const factId = stringField(row, field);
      if (
        factId &&
        (!facts.has(factId) ||
          (targetId &&
            stringField(facts.get(factId)!, "career_entry_id") !== targetId))
      )
        issues.add("extraction-proposal-fact-context");
    }
  }

  for (const [revisionId, row] of jobRevisions) {
    const postingId = stringField(row, "job_posting_id");
    const parentId = stringField(row, "parent_revision_id");
    const sourceId = stringField(row, "source_document_id");
    const text = stringField(row, "normalized_text");
    if (!postingId || !postings.has(postingId))
      issues.add("job-revision-reference");
    if (!text || stringField(row, "content_hash") !== sha256(text))
      issues.add("job-revision-integrity");
    if (sourceId && !sources.has(sourceId))
      issues.add("job-revision-reference");
    if (parentId) {
      const parent = jobRevisions.get(parentId);
      if (
        revisionId === parentId ||
        !parent ||
        stringField(parent, "job_posting_id") !== postingId
      )
        issues.add("job-revision-history-context");
    }
  }
  if (detectsCycle(jobRevisions, "parent_revision_id"))
    issues.add("job-revision-history-context");

  for (const [setId, row] of requirementSets) {
    const revisionId = stringField(row, "job_posting_revision_id");
    const parentId = stringField(row, "parent_set_id");
    if (!revisionId || !jobRevisions.has(revisionId))
      issues.add("requirement-set-reference");
    if (parentId) {
      const parent = requirementSets.get(parentId);
      if (
        setId === parentId ||
        !parent ||
        stringField(parent, "job_posting_revision_id") !== revisionId
      )
        issues.add("requirement-set-history-context");
    }
  }
  if (detectsCycle(requirementSets, "parent_set_id"))
    issues.add("requirement-set-history-context");
  for (const row of requirements.values())
    if (!requirementSets.has(stringField(row, "requirement_set_id") ?? ""))
      issues.add("requirement-reference");
  for (const row of matchRuns.values())
    if (!requirementSets.has(stringField(row, "requirement_set_id") ?? ""))
      issues.add("match-run-reference");
  for (const row of matches.values()) {
    const run = matchRuns.get(stringField(row, "match_run_id") ?? "");
    const requirement = requirements.get(
      stringField(row, "requirement_id") ?? "",
    );
    const setId = stringField(row, "requirement_set_id");
    if (
      !run ||
      !requirement ||
      !setId ||
      stringField(run, "requirement_set_id") !== setId ||
      stringField(requirement, "requirement_set_id") !== setId ||
      !facts.has(stringField(row, "evidence_fact_id") ?? "")
    )
      issues.add("requirement-match-context");
  }
  for (const row of rows(archive, "requirement_evidence_decisions"))
    if (!matches.has(stringField(row, "match_id") ?? ""))
      issues.add("requirement-decision-reference");

  const evidenceByClaim = new Map<string, string[]>();
  const evidencePairs = new Set<string>();
  for (const row of rows(archive, "claim_evidence")) {
    const claimId = stringField(row, "claim_id");
    const factId = stringField(row, "evidence_fact_id");
    const pair = `${claimId ?? ""}:${factId ?? ""}`;
    if (
      !claimId ||
      !factId ||
      !claimRows.has(claimId) ||
      !facts.has(factId) ||
      evidencePairs.has(pair)
    ) {
      issues.add("claim-evidence-reference");
      continue;
    }
    evidencePairs.add(pair);
    const current = evidenceByClaim.get(claimId) ?? [];
    current.push(factId);
    evidenceByClaim.set(claimId, current);
  }

  const claimsByVersion = new Map<string, DocumentGroundingClaim[]>();
  for (const [claimId, row] of claimRows) {
    const versionId = stringField(row, "version_id");
    const blockId = stringField(row, "stable_block_id");
    const startOffset = integerField(row, "start_offset");
    const endOffset = integerField(row, "end_offset");
    const textHash = stringField(row, "text_hash");
    const status = stringField(row, "status");
    if (
      !versionId ||
      !versionRows.has(versionId) ||
      !blockId ||
      startOffset === null ||
      endOffset === null ||
      !textHash ||
      !hashPattern.test(textHash) ||
      !status ||
      !["supported", "unverified", "nonfactual"].includes(status)
    ) {
      issues.add("claim-shape");
      continue;
    }
    const evidence = (evidenceByClaim.get(claimId) ?? []).flatMap((factId) => {
      const fact = facts.get(factId);
      if (!fact) return [];
      const entryId = stringField(fact, "career_entry_id");
      const entry = entryId ? entries.get(entryId) : undefined;
      const displayText = stringField(fact, "display_text");
      if (!displayText || !entry) {
        issues.add("claim-evidence-shape");
        return [];
      }
      return [
        {
          id: factId,
          displayText,
          value: fact.value,
          factStatus: stringField(fact, "status") ?? "missing",
          entryStatus: stringField(entry, "status") ?? "missing",
        },
      ];
    });
    const claim: DocumentGroundingClaim = {
      id: claimId,
      stableBlockId: blockId,
      startOffset,
      endOffset,
      textHash,
      status: status as DocumentGroundingClaim["status"],
      evidence,
    };
    const current = claimsByVersion.get(versionId) ?? [];
    current.push(claim);
    claimsByVersion.set(versionId, current);
  }

  const versionStates = new Map<string, VersionState>();
  for (const [versionId, row] of versionRows) {
    const documentId = stringField(row, "document_id");
    const owner = documentId ? documents.get(documentId) : undefined;
    const storedHash = stringField(row, "content_hash");
    const parsed = canonicalDocumentSchema.safeParse(row.content);
    if (
      !documentId ||
      !owner ||
      !storedHash ||
      !hashPattern.test(storedHash) ||
      !parsed.success ||
      contentHash(parsed.success ? parsed.data : null) !== storedHash
    ) {
      issues.add("document-version-integrity");
      continue;
    }
    if (stringField(owner, "kind") !== parsed.data.kind)
      issues.add("document-version-kind");
    for (const field of [
      "parent_version_id",
      "restored_from_version_id",
    ] as const) {
      const relatedId = stringField(row, field);
      if (
        relatedId &&
        (relatedId === versionId ||
          stringField(versionRows.get(relatedId) ?? {}, "document_id") !==
            documentId)
      )
        issues.add("document-version-history-context");
    }
    const claims = claimsByVersion.get(versionId) ?? [];
    const assessment = assessDocumentGrounding(parsed.data, claims);
    if (assessment.structuralIssueIds.length > 0)
      issues.add("document-claim-structure");
    // Preserve immutable claim history even when a later policy or lifecycle
    // change makes a formerly supported assertion ineligible. Current ATS and
    // binary-export gates reassess exact grounding; artifact manifests below
    // remain pinned to that current assessment.
    versionStates.set(versionId, {
      contentHash: storedHash,
      document: parsed.data,
      claims,
      unsupportedClaimIds: assessment.unsupportedClaimIds,
      groundingStateHash: groundingStateHash(
        claims,
        assessment.unsupportedClaimIds,
      ),
    });
  }
  if (
    detectsCycle(versionRows, "parent_version_id") ||
    detectsCycle(versionRows, "restored_from_version_id")
  )
    issues.add("document-version-history-context");

  for (const row of claimRows.values()) {
    const sourceClaimId = stringField(row, "source_claim_id");
    if (!sourceClaimId) continue;
    const sourceClaim = claimRows.get(sourceClaimId);
    const version = versionRows.get(stringField(row, "version_id") ?? "");
    const sourceVersion = versionRows.get(
      stringField(sourceClaim ?? {}, "version_id") ?? "",
    );
    if (
      !sourceClaim ||
      !version ||
      !sourceVersion ||
      stringField(sourceVersion, "document_id") !==
        stringField(version, "document_id")
    )
      issues.add("claim-history-context");
  }

  for (const [documentId, row] of documents) {
    const currentVersionId = stringField(row, "current_version_id");
    if (currentVersionId) {
      const version = versionRows.get(currentVersionId);
      if (
        !version ||
        stringField(version, "document_id") !== documentId ||
        !versionStates.has(currentVersionId)
      )
        issues.add("document-current-version");
    }
  }

  for (const row of documentDrafts.values()) {
    const documentId = stringField(row, "document_id");
    const baseVersion = versionRows.get(
      stringField(row, "base_version_id") ?? "",
    );
    const draft = canonicalDocumentSchema.safeParse(row.content);
    if (
      !documentId ||
      !documents.has(documentId) ||
      !baseVersion ||
      stringField(baseVersion, "document_id") !== documentId ||
      !draft.success ||
      draft.data.kind !== stringField(documents.get(documentId)!, "kind")
    )
      issues.add("document-draft-context");
  }
  for (const row of documentLocks.values())
    if (!documents.has(stringField(row, "document_id") ?? ""))
      issues.add("document-lock-reference");

  const selectedEntries = new Map<string, Set<string>>();
  for (const row of rows(archive, "tailoring_run_entries")) {
    const runId = stringField(row, "run_id");
    const entryId = stringField(row, "career_entry_id");
    if (
      !runId ||
      !tailoringRuns.has(runId) ||
      !entryId ||
      !entries.has(entryId)
    ) {
      issues.add("tailoring-entry-reference");
      continue;
    }
    const selected = selectedEntries.get(runId) ?? new Set<string>();
    selected.add(entryId);
    selectedEntries.set(runId, selected);
  }
  const selectedEvidence = new Map<string, Set<string>>();
  for (const row of rows(archive, "tailoring_run_evidence")) {
    const runId = stringField(row, "run_id");
    const factId = stringField(row, "evidence_fact_id");
    const fact = facts.get(factId ?? "");
    const entryId = stringField(fact ?? {}, "career_entry_id");
    if (
      !runId ||
      !tailoringRuns.has(runId) ||
      !factId ||
      !fact ||
      !entryId ||
      !selectedEntries.get(runId)?.has(entryId)
    ) {
      issues.add("tailoring-evidence-context");
      continue;
    }
    const selected = selectedEvidence.get(runId) ?? new Set<string>();
    selected.add(factId);
    selectedEvidence.set(runId, selected);
  }

  for (const row of tailoringRuns.values()) {
    const documentId = stringField(row, "document_id");
    const document = documents.get(documentId ?? "");
    const version = versionRows.get(stringField(row, "base_version_id") ?? "");
    const revisionId = stringField(row, "job_posting_revision_id");
    const setId = stringField(row, "requirement_set_id");
    const set = requirementSets.get(setId ?? "");
    const matchRun = matchRuns.get(stringField(row, "match_run_id") ?? "");
    const providerId = stringField(row, "provider_configuration_id");
    if (
      !document ||
      !version ||
      stringField(version, "document_id") !== documentId ||
      stringField(document, "kind") !== stringField(row, "kind") ||
      !revisionId ||
      !jobRevisions.has(revisionId) ||
      !set ||
      stringField(set, "job_posting_revision_id") !== revisionId ||
      !matchRun ||
      stringField(matchRun, "requirement_set_id") !== setId ||
      (providerId !== null && !providers.has(providerId))
    )
      issues.add("tailoring-run-context");
  }

  for (const row of rows(archive, "tailoring_gaps")) {
    const run = tailoringRuns.get(stringField(row, "run_id") ?? "");
    const requirement = requirements.get(
      stringField(row, "requirement_id") ?? "",
    );
    if (
      !run ||
      !requirement ||
      stringField(requirement, "requirement_set_id") !==
        stringField(run, "requirement_set_id")
    )
      issues.add("tailoring-gap-context");
  }

  const requirementsBySuggestion = new Map<
    string,
    Array<Record<string, unknown>>
  >();
  for (const link of rows(archive, "tailoring_suggestion_requirements")) {
    const suggestionId = stringField(link, "suggestion_id");
    if (!suggestionId || !suggestions.has(suggestionId)) {
      issues.add("tailoring-suggestion-requirement-context");
      continue;
    }
    const linked = requirementsBySuggestion.get(suggestionId) ?? [];
    linked.push(link);
    requirementsBySuggestion.set(suggestionId, linked);
  }

  for (const [suggestionId, row] of suggestions) {
    const runId = stringField(row, "run_id");
    const run = tailoringRuns.get(runId ?? "");
    const base = versionStates.get(
      stringField(run ?? {}, "base_version_id") ?? "",
    );
    const sectionId = stringField(row, "target_section_id");
    const blockId = stringField(row, "target_block_id");
    const section = base?.document.sections.find(
      (item) => item.id === sectionId,
    );
    const acceptedVersionId = stringField(row, "accepted_version_id");
    const accepted = versionRows.get(acceptedVersionId ?? "");
    if (
      !run ||
      !base ||
      !section ||
      (blockId !== null &&
        !section.blocks.some((block) => block.id === blockId)) ||
      (acceptedVersionId !== null &&
        (!accepted ||
          stringField(accepted, "document_id") !==
            stringField(run, "document_id")))
    )
      issues.add("tailoring-suggestion-context");

    for (const link of requirementsBySuggestion.get(suggestionId) ?? []) {
      const requirement = requirements.get(
        stringField(link, "requirement_id") ?? "",
      );
      if (
        !requirement ||
        !run ||
        stringField(requirement, "requirement_set_id") !==
          stringField(run, "requirement_set_id")
      )
        issues.add("tailoring-suggestion-requirement-context");
    }
  }

  const evidenceByCandidate = new Map<string, string[]>();
  for (const row of rows(archive, "tailoring_claim_evidence")) {
    const candidateId = stringField(row, "claim_candidate_id");
    const factId = stringField(row, "evidence_fact_id");
    const candidate = candidates.get(candidateId ?? "");
    const suggestion = suggestions.get(
      stringField(candidate ?? {}, "suggestion_id") ?? "",
    );
    const runId = stringField(suggestion ?? {}, "run_id");
    if (
      !candidateId ||
      !candidate ||
      !factId ||
      !facts.has(factId) ||
      !runId ||
      !selectedEvidence.get(runId)?.has(factId)
    ) {
      issues.add("tailoring-claim-evidence-context");
      continue;
    }
    const selected = evidenceByCandidate.get(candidateId) ?? [];
    selected.push(factId);
    evidenceByCandidate.set(candidateId, selected);
  }
  for (const [candidateId, row] of candidates) {
    const suggestion = suggestions.get(stringField(row, "suggestion_id") ?? "");
    const afterText = suggestion ? stringField(suggestion, "after_text") : null;
    const start = integerField(row, "start_offset");
    const end = integerField(row, "end_offset");
    const evidence = evidenceByCandidate.get(candidateId) ?? [];
    const relation = stringField(row, "relation");
    if (
      !suggestion ||
      afterText === null ||
      start === null ||
      end === null ||
      start < 0 ||
      end <= start ||
      end > afterText.length ||
      stringField(row, "text_hash") !==
        contentHash(afterText.slice(start, end)) ||
      (relation === "combines" ? evidence.length < 2 : evidence.length !== 1)
    )
      issues.add("tailoring-claim-context");
  }
  for (const row of rows(archive, "tailoring_task_results"))
    if (!tailoringRuns.has(stringField(row, "run_id") ?? ""))
      issues.add("tailoring-task-result-reference");

  for (const row of atsReports.values()) {
    const version = versionStates.get(
      stringField(row, "document_version_id") ?? "",
    );
    const revisionId = stringField(row, "job_posting_revision_id");
    const setId = stringField(row, "requirement_set_id");
    const revision = jobRevisions.get(revisionId ?? "");
    const set = requirementSets.get(setId ?? "");
    if (
      !version ||
      stringField(row, "document_hash") !== version.contentHash ||
      (revisionId === null) !== (setId === null) ||
      (revisionId !== null &&
        (!revision ||
          !set ||
          stringField(set, "job_posting_revision_id") !== revisionId ||
          stringField(row, "job_hash") !==
            stringField(revision, "content_hash")))
    )
      issues.add("ats-report-context");
    const providerId = stringField(row, "provider_configuration_id");
    if (
      providerId !== null &&
      (!providers.has(providerId) ||
        !stringField(row, "model") ||
        !stringField(row, "task_version") ||
        !stringField(row, "output_hash"))
    )
      issues.add("ats-report-ai-provenance");
  }
  for (const row of rows(archive, "ats_category_scores"))
    if (!atsReports.has(stringField(row, "report_id") ?? ""))
      issues.add("ats-score-reference");
  for (const row of rows(archive, "ats_findings"))
    if (!atsReports.has(stringField(row, "report_id") ?? ""))
      issues.add("ats-finding-reference");
  for (const row of sourceAtsReports.values()) {
    const source = sources.get(stringField(row, "source_document_id") ?? "");
    const revisionId = stringField(row, "job_posting_revision_id");
    const setId = stringField(row, "requirement_set_id");
    const revision = jobRevisions.get(revisionId ?? "");
    const set = requirementSets.get(setId ?? "");
    if (
      !source ||
      stringField(source, "content_hash") !==
        stringField(row, "document_hash") ||
      (revisionId === null) !== (setId === null) ||
      (revisionId !== null &&
        (!revision ||
          !set ||
          stringField(set, "job_posting_revision_id") !== revisionId ||
          stringField(row, "job_hash") !==
            stringField(revision, "content_hash")))
    )
      issues.add("source-ats-report-context");
    const providerId = stringField(row, "provider_configuration_id");
    if (
      providerId !== null &&
      (!providers.has(providerId) ||
        !stringField(row, "model") ||
        !stringField(row, "task_version") ||
        !stringField(row, "output_hash"))
    )
      issues.add("source-ats-report-ai-provenance");
  }
  for (const row of rows(archive, "source_ats_category_scores"))
    if (!sourceAtsReports.has(stringField(row, "report_id") ?? ""))
      issues.add("source-ats-score-reference");
  for (const row of rows(archive, "source_ats_findings"))
    if (!sourceAtsReports.has(stringField(row, "report_id") ?? ""))
      issues.add("source-ats-finding-reference");

  const projectedSections = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows(archive, "document_sections")) {
    const versionId = stringField(row, "version_id");
    if (!versionId || !versionRows.has(versionId)) {
      issues.add("document-section-reference");
      continue;
    }
    const current = projectedSections.get(versionId) ?? [];
    current.push(row);
    projectedSections.set(versionId, current);
  }
  for (const [versionId, state] of versionStates) {
    const projections = projectedSections.get(versionId) ?? [];
    if (projections.length !== state.document.sections.length) {
      issues.add("document-section-projection");
      continue;
    }
    for (const [position, section] of state.document.sections.entries()) {
      const projection = projections.find(
        (row) => integerField(row, "position") === position,
      );
      if (
        !projection ||
        stringField(projection, "stable_section_id") !== section.id ||
        stringField(projection, "section_type") !== section.type ||
        (projection.heading ?? null) !== (section.heading ?? null) ||
        stringField(projection, "content_hash") !== contentHash(section)
      )
        issues.add("document-section-projection");
    }
  }

  const blobKeys = new Set<string>();
  const blobByKey = new Map<string, PortabilityArchive["blobs"][number]>();
  for (const blob of archive.blobs) {
    const key = `${blob.kind}:${blob.resourceId}`;
    if (blobKeys.has(key)) issues.add("blob-duplicate");
    blobKeys.add(key);
    blobByKey.set(key, blob);
  }

  const artifacts = mapById(
    rows(archive, "export_artifacts"),
    issues,
    "artifact-identifier",
  );
  for (const [artifactId, row] of artifacts) {
    const versionId = stringField(row, "document_version_id");
    const state = versionId ? versionStates.get(versionId) : undefined;
    const blob = blobByKey.get(`export:${artifactId}`);
    const manifest = recordField(row, "manifest");
    const unsupported = manifest?.unsupportedClaimIds;
    const classification = stringField(row, "classification");
    const expectedClassification = state?.unsupportedClaimIds.length
      ? "draft"
      : "final";
    if (
      stringField(row, "storage_key") !==
      `${archive.sourceWorkspaceId}/${artifactId}.bin`
    )
      issues.add("artifact-storage-identity");
    if (!state) issues.add("artifact-version-reference");
    if (
      !blob ||
      stringField(row, "content_hash") !== blob?.contentHash ||
      integerField(row, "byte_size") !== blob?.byteSize ||
      stringField(row, "media_type") !== blob?.mediaType
    )
      issues.add("artifact-blob-integrity");
    if (
      !manifest ||
      manifest.schemaVersion !== 1 ||
      manifest.templateId !== "ats-safe-single-column@2" ||
      manifest.groundingPolicyVersion !== GROUNDING_POLICY_VERSION
    )
      issues.add("artifact-manifest-policy");
    if (state && manifest) {
      if (manifest.sourceDocumentHash !== state.contentHash)
        issues.add("artifact-source-hash");
      if (manifest.groundingStateHash !== state.groundingStateHash)
        issues.add("artifact-grounding-hash");
      if (
        !Array.isArray(unsupported) ||
        !unsupported.every((value) => typeof value === "string") ||
        !sameStrings(
          unsupported.filter(
            (value): value is string => typeof value === "string",
          ),
          state.unsupportedClaimIds,
        )
      )
        issues.add("artifact-unsupported-claims");
      if (classification !== expectedClassification)
        issues.add("artifact-classification");
    }
  }
  for (const blob of archive.blobs) {
    if (blob.kind === "export" && !artifacts.has(blob.resourceId))
      issues.add("artifact-blob-reference");
    if (blob.kind === "source") {
      const source = sources.get(blob.resourceId);
      if (
        !source ||
        stringField(source, "content_hash") !== blob.contentHash ||
        integerField(source, "byte_size") !== blob.byteSize ||
        stringField(source, "detected_media_type") !== blob.mediaType
      )
        issues.add("source-blob-reference");
    }
  }

  return [...issues].sort();
}
