import type { Pool, PoolClient } from "@/infrastructure/database/sqlite-pool";

import type {
  EvidenceValue,
  TailoringRunManifest,
} from "@/infrastructure/database/value-types";
import {
  canonicalDocumentSchema,
  type CanonicalDocument,
} from "@/modules/documents/document-schema";
import {
  assessTextGrounding,
  type DocumentGroundingClaim,
} from "@/modules/documents/grounding";
import { contentHash } from "@/modules/documents/hash";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";

import type {
  EvidenceRequirementSupport,
  TailoringEvidenceInput,
} from "./domain";
import {
  coverLetterParagraphSchema,
  resumeBulletSuggestionSchema,
  tailoringHash,
  validateResumeBulletSuggestion,
} from "./domain";

export class TailoringNotFoundError extends Error {
  public constructor() {
    super("The tailoring run or one of its inputs is unavailable.");
    this.name = "TailoringNotFoundError";
  }
}

export class TailoringInputConflictError extends Error {
  public constructor() {
    super("The tailoring inputs changed or are not eligible.");
    this.name = "TailoringInputConflictError";
  }
}

export class TailoringStaleRunError extends Error {
  public constructor() {
    super("The source document changed after this run was created.");
    this.name = "TailoringStaleRunError";
  }
}

export interface ResumeSetupData {
  document: { id: string; title: string; current_version_id: string };
  jobs: Array<{ id: string; title: string; company: string | null }>;
  entries: Array<{
    id: string;
    type: string;
    title: string;
    organization: string | null;
  }>;
}

export interface TailoringRunInput {
  documentId: string;
  jobId: string;
  selectedEntryIds: string[];
  providerConfigurationId: string;
  tone: "direct" | "formal" | "warm";
  targetLength: "concise" | "standard";
  idempotencyKey: string;
}

export interface PreparedResumeRun {
  runId: string;
  existing: boolean;
  providerConfigurationId: string;
  baseContent: CanonicalDocument;
  baseContentHash: string;
  jobText: string;
  requirements: Array<{
    id: string;
    text: string;
    category: string;
    priority: string;
  }>;
  evidence: TailoringEvidenceInput[];
  support: EvidenceRequirementSupport[];
  lockedSectionIds: Set<string>;
  lockedBlockIds: Set<string>;
}

export interface PersistedTaskResult {
  taskId: string;
  taskVersion: string;
  providerKind: string;
  model: string;
  attempts: number;
  inputHash: string;
  outputHash: string;
  usage: { inputTokens?: number; outputTokens?: number };
  result: Record<string, unknown>;
}

export interface PersistedSuggestion {
  operation: "replace_block_text";
  targetSectionId: string;
  targetBlockId: string;
  baseBlockHash: string;
  beforeText: string;
  afterText: string;
  rationale: string;
  taskId: "AI-06" | "AI-08" | "deterministic-letter-framing";
  taskVersion: string;
  requirementIds: string[];
  claims: Array<{
    start: number;
    end: number;
    relation: "direct" | "combines" | "paraphrases";
    evidenceFactIds: string[];
  }>;
}

export interface TailoringRunView {
  run: {
    id: string;
    kind: "resume" | "cover_letter";
    status: "generating" | "ready" | "failed" | "completed" | "discarded";
    failure_code: string | null;
    manifest: TailoringRunManifest;
    document_id: string;
    document_title: string;
    job_title: string;
    created_at: Date;
  };
  suggestions: Array<{
    id: string;
    sequence: number;
    operation: string;
    target_section_id: string;
    target_block_id: string | null;
    before_text: string | null;
    after_text: string | null;
    rationale: string;
    status: string;
    requirement_ids: string[];
    claims: Array<{
      id: string;
      start_offset: number;
      end_offset: number;
      relation: string;
      evidence: Array<{
        id: string;
        entryId: string;
        displayText: string;
        sourceLabel: string | null;
        status: string;
      }>;
    }>;
  }>;
  gaps: Array<{
    requirement_id: string;
    requirement_text: string;
    code: string;
    detail: string;
  }>;
}

export interface TailoringReviewDecision {
  suggestionId: string;
  decision: "accepted" | "rejected";
  editedText: string;
}

async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function audit(
  client: PoolClient,
  principal: WorkspacePrincipal,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO audit_events (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata) VALUES ($1,$2,$3,'tailoring_run',$4,'succeeded',$5,$6::jsonb)`,
    [
      principal.workspaceId,
      principal.userId,
      action,
      targetId,
      crypto.randomUUID(),
      JSON.stringify(metadata),
    ],
  );
}

export class TailoringRepository {
  public constructor(private readonly pool: Pool) {}

  public async getResumeSetup(
    principal: WorkspacePrincipal,
    documentId: string,
  ): Promise<ResumeSetupData> {
    return this.getSetup(principal, documentId, "resume");
  }

  public async getCoverLetterSetup(
    principal: WorkspacePrincipal,
    documentId: string,
  ): Promise<ResumeSetupData> {
    return this.getSetup(principal, documentId, "cover_letter");
  }

  private async getSetup(
    principal: WorkspacePrincipal,
    documentId: string,
    kind: "resume" | "cover_letter",
  ): Promise<ResumeSetupData> {
    const [document, jobs, entries] = await Promise.all([
      this.pool.query<ResumeSetupData["document"]>(
        `SELECT id,title,current_version_id FROM documents WHERE id=$1 AND workspace_id=$2 AND kind=$3 AND status='active'`,
        [documentId, principal.workspaceId, kind],
      ),
      this.pool.query<ResumeSetupData["jobs"][number]>(
        `SELECT DISTINCT j.id,j.title,j.company FROM job_postings j
         JOIN job_posting_revisions r ON r.id=(SELECT latest.id FROM job_posting_revisions latest WHERE latest.job_posting_id=j.id AND latest.workspace_id=j.workspace_id ORDER BY latest.revision_number DESC LIMIT 1)
         JOIN job_requirement_sets s ON s.job_posting_revision_id=r.id AND s.workspace_id=j.workspace_id AND s.status='reviewed'
         JOIN requirement_match_runs m ON m.requirement_set_id=s.id AND m.workspace_id=s.workspace_id
         WHERE j.workspace_id=$1 AND j.status='active' ORDER BY j.title,j.id`,
        [principal.workspaceId],
      ),
      this.pool.query<ResumeSetupData["entries"][number]>(
        `SELECT id,type,title,organization FROM career_entries WHERE workspace_id=$1 AND status='active' ORDER BY type,title,id`,
        [principal.workspaceId],
      ),
    ]);
    if (!document.rows[0]) throw new TailoringNotFoundError();
    return {
      document: document.rows[0],
      jobs: jobs.rows,
      entries: entries.rows,
    };
  }

  public async prepareResumeRun(
    principal: WorkspacePrincipal,
    input: TailoringRunInput,
  ): Promise<PreparedResumeRun> {
    return this.prepareRun(principal, input, "resume");
  }

  public async prepareCoverLetterRun(
    principal: WorkspacePrincipal,
    input: TailoringRunInput,
  ): Promise<PreparedResumeRun> {
    return this.prepareRun(principal, input, "cover_letter");
  }

  private async prepareRun(
    principal: WorkspacePrincipal,
    input: TailoringRunInput,
    kind: "resume" | "cover_letter",
  ): Promise<PreparedResumeRun> {
    return transaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`tailoring:${principal.workspaceId}:${input.idempotencyKey}`],
      );
      const prior = await client.query<{ id: string }>(
        `SELECT id FROM tailoring_runs WHERE workspace_id=$1 AND idempotency_key=$2`,
        [principal.workspaceId, input.idempotencyKey],
      );
      if (prior.rows[0])
        return {
          runId: prior.rows[0].id,
          existing: true,
          providerConfigurationId: input.providerConfigurationId,
          baseContent: { schemaVersion: 1, kind, sections: [] },
          baseContentHash: "",
          jobText: "",
          requirements: [],
          evidence: [],
          support: [],
          lockedSectionIds: new Set(),
          lockedBlockIds: new Set(),
        };
      const document = await client.query<{
        current_version_id: string;
        content: CanonicalDocument;
        content_hash: string;
      }>(
        `SELECT d.current_version_id,v.content,v.content_hash FROM documents d JOIN document_versions v ON v.id=d.current_version_id AND v.workspace_id=d.workspace_id WHERE d.id=$1 AND d.workspace_id=$2 AND d.kind=$3 AND d.status='active' FOR UPDATE`,
        [input.documentId, principal.workspaceId, kind],
      );
      const documentRow = document.rows[0];
      if (!documentRow) throw new TailoringNotFoundError();
      const selectedEntries = [...new Set(input.selectedEntryIds)];
      if (!selectedEntries.length) throw new TailoringInputConflictError();
      const entryCount = await client.query<{ count: string }>(
        `SELECT count(*)::text count FROM career_entries WHERE workspace_id=$1 AND status='active' AND id=ANY($2::uuid[])`,
        [principal.workspaceId, selectedEntries],
      );
      if (Number(entryCount.rows[0]!.count) !== selectedEntries.length)
        throw new TailoringInputConflictError();
      const job = await client.query<{
        job_revision_id: string;
        normalized_text: string;
        job_hash: string;
        requirement_set_id: string;
        match_run_id: string;
      }>(
        `SELECT r.id job_revision_id,r.normalized_text,r.content_hash job_hash,s.id requirement_set_id,m.id match_run_id
         FROM job_postings j
         JOIN job_posting_revisions r ON r.id=(SELECT latest.id FROM job_posting_revisions latest WHERE latest.job_posting_id=j.id AND latest.workspace_id=j.workspace_id ORDER BY latest.revision_number DESC LIMIT 1)
         JOIN job_requirement_sets s ON s.id=(SELECT latest.id FROM job_requirement_sets latest WHERE latest.job_posting_revision_id=r.id AND latest.workspace_id=j.workspace_id AND latest.status='reviewed' ORDER BY latest.revision_number DESC LIMIT 1)
         JOIN requirement_match_runs m ON m.id=(SELECT latest.id FROM requirement_match_runs latest WHERE latest.requirement_set_id=s.id AND latest.workspace_id=j.workspace_id ORDER BY latest.revision_number DESC LIMIT 1)
         WHERE j.id=$1 AND j.workspace_id=$2 AND j.status='active'`,
        [input.jobId, principal.workspaceId],
      );
      const jobRow = job.rows[0];
      if (!jobRow) throw new TailoringNotFoundError();
      const provider = await client.query<{
        task_assignments: Record<string, string>;
      }>(
        `SELECT task_assignments FROM model_provider_configurations WHERE id=$1 AND workspace_id=$2 AND status='available' AND json_extract(capabilities,'$.structuredOutput')=1`,
        [input.providerConfigurationId, principal.workspaceId],
      );
      const requiredTasks =
        kind === "resume"
          ? (["AI-05", "AI-06"] as const)
          : (["AI-07", "AI-08"] as const);
      if (
        !provider.rows[0] ||
        requiredTasks.some(
          (taskId) => !provider.rows[0]!.task_assignments[taskId],
        )
      )
        throw new TailoringInputConflictError();
      const requirements = await client.query<{
        id: string;
        text: string;
        category: string;
        priority: string;
      }>(
        `SELECT id,requirement_text text,category,priority FROM job_requirements WHERE requirement_set_id=$1 AND workspace_id=$2 AND decision='accepted' ORDER BY created_at,id`,
        [jobRow.requirement_set_id, principal.workspaceId],
      );
      const facts = await client.query<{
        id: string;
        display_text: string;
        value: EvidenceValue;
        career_entry_id: string;
        requirement_id: string;
        strength: "direct" | "combined";
      }>(
        `SELECT f.id,f.display_text,f.value,f.career_entry_id,m.requirement_id,m.strength
         FROM requirement_evidence_matches m
         JOIN evidence_facts f ON f.id=m.evidence_fact_id AND f.workspace_id=m.workspace_id AND f.status='approved'
         JOIN career_entries e ON e.id=f.career_entry_id AND e.workspace_id=f.workspace_id AND e.status='active'
         JOIN requirement_evidence_decisions d ON d.id=(SELECT latest.id FROM requirement_evidence_decisions latest WHERE latest.match_id=m.id AND latest.workspace_id=m.workspace_id ORDER BY latest.revision_number DESC LIMIT 1)
         WHERE m.match_run_id=$1 AND m.workspace_id=$2 AND m.strength IN ('direct','combined') AND d.decision='included' AND f.career_entry_id=ANY($3::uuid[])
         ORDER BY f.id,m.requirement_id`,
        [jobRow.match_run_id, principal.workspaceId, selectedEntries],
      );
      const evidenceById = new Map<
        string,
        { id: string; displayText: string; value: EvidenceValue }
      >();
      for (const fact of facts.rows)
        evidenceById.set(fact.id, {
          id: fact.id,
          displayText: fact.display_text,
          value: fact.value,
        });
      if (!evidenceById.size) throw new TailoringInputConflictError();
      const locks = await client.query<{
        target_type: "section" | "block" | "claim" | "fact";
        target_id: string;
        locked_hash: string;
      }>(
        `SELECT target_type,target_id,locked_hash FROM document_locks WHERE document_id=$1 AND workspace_id=$2`,
        [input.documentId, principal.workspaceId],
      );
      const lockedSectionIds = new Set<string>();
      const lockedBlockIds = new Set<string>();
      const lockedHashes: TailoringRunManifest["lockedHashes"] = [];
      for (const lock of locks.rows) {
        let actualHash: string | null = null;
        if (lock.target_type === "section") {
          const section = documentRow.content.sections.find(
            (item) => item.id === lock.target_id,
          );
          if (section) {
            actualHash = contentHash(section);
            lockedSectionIds.add(section.id);
            section.blocks.forEach((block) => lockedBlockIds.add(block.id));
          }
        } else if (lock.target_type === "block") {
          const block = documentRow.content.sections
            .flatMap((section) => section.blocks)
            .find((item) => item.id === lock.target_id);
          if (block) {
            actualHash = contentHash(block);
            lockedBlockIds.add(block.id);
          }
        } else if (lock.target_type === "fact") {
          const fact = await client.query<{
            value: unknown;
            display_text: string;
          }>(
            `SELECT f.value,f.display_text FROM evidence_facts f JOIN career_entries e ON e.id=f.career_entry_id AND e.workspace_id=f.workspace_id WHERE f.id=$1 AND f.workspace_id=$2 AND f.status='approved' AND e.status='active'`,
            [lock.target_id, principal.workspaceId],
          );
          if (fact.rows[0]) {
            actualHash = contentHash(fact.rows[0]);
            const protectedBlocks = await client.query<{
              stable_block_id: string;
            }>(
              `SELECT DISTINCT c.stable_block_id FROM generated_claims c JOIN claim_evidence ce ON ce.claim_id=c.id AND ce.workspace_id=c.workspace_id WHERE c.version_id=$1 AND c.workspace_id=$2 AND ce.evidence_fact_id=$3`,
              [
                documentRow.current_version_id,
                principal.workspaceId,
                lock.target_id,
              ],
            );
            protectedBlocks.rows.forEach((item) =>
              lockedBlockIds.add(item.stable_block_id),
            );
          }
        } else if (lock.target_type === "claim") {
          const claim = await client.query<{
            stable_block_id: string;
            text_hash: string;
          }>(
            `SELECT stable_block_id,text_hash FROM generated_claims WHERE id=$1 AND version_id=$2 AND workspace_id=$3`,
            [
              lock.target_id,
              documentRow.current_version_id,
              principal.workspaceId,
            ],
          );
          if (claim.rows[0]) {
            actualHash = claim.rows[0].text_hash;
            lockedBlockIds.add(claim.rows[0].stable_block_id);
          }
        }
        if (!actualHash || actualHash !== lock.locked_hash)
          throw new TailoringInputConflictError();
        lockedHashes.push({
          targetType: lock.target_type,
          targetId: lock.target_id,
          hash: lock.locked_hash,
        });
      }
      const manifest: TailoringRunManifest = {
        schemaVersion: 1,
        inputHash: tailoringHash({
          document: documentRow.content_hash,
          job: jobRow.job_hash,
          entries: selectedEntries,
          evidence: [...evidenceById.keys()],
          matchRunId: jobRow.match_run_id,
        }),
        baseContentHash: documentRow.content_hash,
        jobContentHash: jobRow.job_hash,
        taskVersions:
          kind === "resume"
            ? ["ai-05.v1", "ai-06.v1"]
            : ["ai-07.v1", "ai-08.v1"],
        promptPolicyVersion: "grounded-tailoring@1",
        selectedTone: input.tone,
        targetLength: input.targetLength,
        lockedBlockIds: [...lockedBlockIds].sort(),
        lockedHashes,
      };
      const run = await client.query<{ id: string }>(
        `INSERT INTO tailoring_runs (workspace_id,kind,document_id,base_version_id,job_posting_revision_id,requirement_set_id,match_run_id,provider_configuration_id,model,idempotency_key,manifest,created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'per-task assignments',$9,$10::jsonb,$11) RETURNING id`,
        [
          principal.workspaceId,
          kind,
          input.documentId,
          documentRow.current_version_id,
          jobRow.job_revision_id,
          jobRow.requirement_set_id,
          jobRow.match_run_id,
          input.providerConfigurationId,
          input.idempotencyKey,
          JSON.stringify(manifest),
          principal.userId,
        ],
      );
      const runId = run.rows[0]!.id;
      for (const entryId of selectedEntries)
        await client.query(
          `INSERT INTO tailoring_run_entries (workspace_id,run_id,career_entry_id) VALUES ($1,$2,$3)`,
          [principal.workspaceId, runId, entryId],
        );
      for (const factId of evidenceById.keys())
        await client.query(
          `INSERT INTO tailoring_run_evidence (workspace_id,run_id,evidence_fact_id) VALUES ($1,$2,$3)`,
          [principal.workspaceId, runId, factId],
        );
      await audit(client, principal, "tailoring.create", runId, {
        kind,
        entryCount: selectedEntries.length,
        evidenceCount: evidenceById.size,
        requirementCount: requirements.rows.length,
      });
      return {
        runId,
        existing: false,
        providerConfigurationId: input.providerConfigurationId,
        baseContent: documentRow.content,
        baseContentHash: documentRow.content_hash,
        jobText: jobRow.normalized_text,
        requirements: requirements.rows,
        evidence: [...evidenceById.values()],
        support: facts.rows.map((fact) => ({
          evidenceFactId: fact.id,
          requirementId: fact.requirement_id,
          strength: fact.strength,
        })),
        lockedSectionIds,
        lockedBlockIds,
      };
    });
  }

  public async completeResumeRun(
    principal: WorkspacePrincipal,
    runId: string,
    input: {
      taskResults: PersistedTaskResult[];
      suggestions: PersistedSuggestion[];
      gaps: Array<{ requirementId: string; code: string; detail: string }>;
    },
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const run = await client.query<{
        id: string;
        kind: "resume" | "cover_letter";
        content: CanonicalDocument;
        requirement_set_id: string;
        match_run_id: string;
        manifest: TailoringRunManifest;
      }>(
        `SELECT r.id,r.kind,v.content,r.requirement_set_id,r.match_run_id,r.manifest
         FROM tailoring_runs r
         JOIN document_versions v ON v.id=r.base_version_id AND v.workspace_id=r.workspace_id
         WHERE r.id=$1 AND r.workspace_id=$2 AND r.status='generating' FOR UPDATE OF r`,
        [runId, principal.workspaceId],
      );
      const runRow = run.rows[0];
      if (!runRow) throw new TailoringInputConflictError();
      const allowedRequirements = await client.query<{ id: string }>(
        `SELECT id FROM job_requirements WHERE requirement_set_id=$1 AND workspace_id=$2 AND decision='accepted'`,
        [runRow.requirement_set_id, principal.workspaceId],
      );
      const pinnedEvidence = await client.query<{
        id: string;
        display_text: string;
        value: EvidenceValue;
      }>(
        `SELECT f.id,f.display_text,f.value
         FROM tailoring_run_evidence re
         JOIN evidence_facts f ON f.id=re.evidence_fact_id AND f.workspace_id=re.workspace_id
         WHERE re.run_id=$1 AND re.workspace_id=$2`,
        [runId, principal.workspaceId],
      );
      const strongSupport = await client.query<EvidenceRequirementSupport>(
        `SELECT m.evidence_fact_id "evidenceFactId",m.requirement_id "requirementId",m.strength
         FROM requirement_evidence_matches m
         JOIN tailoring_run_evidence re ON re.evidence_fact_id=m.evidence_fact_id AND re.workspace_id=m.workspace_id AND re.run_id=$1
         WHERE m.match_run_id=$2 AND m.workspace_id=$3 AND m.strength IN ('direct','combined')`,
        [runId, runRow.match_run_id, principal.workspaceId],
      );
      const requirementIds = new Set(
        allowedRequirements.rows.map((requirement) => requirement.id),
      );
      const evidence = new Map(
        pinnedEvidence.rows.map((fact) => [
          fact.id,
          { id: fact.id, displayText: fact.display_text, value: fact.value },
        ]),
      );
      const lockedSections = new Set(
        runRow.manifest.lockedHashes
          .filter((lock) => lock.targetType === "section")
          .map((lock) => lock.targetId),
      );
      const lockedBlocks = new Set(runRow.manifest.lockedBlockIds);
      for (const suggestion of input.suggestions) {
        const section = runRow.content.sections.find(
          (item) => item.id === suggestion.targetSectionId,
        );
        const block = section?.blocks.find(
          (item) => item.id === suggestion.targetBlockId,
        );
        if (
          !section ||
          !block ||
          lockedSections.has(section.id) ||
          lockedBlocks.has(block.id) ||
          contentHash(block) !== suggestion.baseBlockHash ||
          block.text !== suggestion.beforeText
        )
          throw new TailoringInputConflictError();
        if (suggestion.taskId === "deterministic-letter-framing") {
          const expected =
            section.type === "salutation"
              ? "Dear Hiring Team,"
              : section.type === "closing"
                ? "Thank you for your consideration."
                : null;
          if (
            runRow.kind !== "cover_letter" ||
            suggestion.taskVersion !== "deterministic-letter-framing@1" ||
            suggestion.afterText !== expected ||
            suggestion.claims.length ||
            suggestion.requirementIds.length
          )
            throw new TailoringInputConflictError();
        } else {
          const schema =
            suggestion.taskId === "AI-06"
              ? resumeBulletSuggestionSchema
              : coverLetterParagraphSchema;
          const validated = schema.parse({
            schemaVersion:
              suggestion.taskId === "AI-06" ? "ai-06.v1" : "ai-08.v1",
            operation: suggestion.operation,
            targetBlockId: suggestion.targetBlockId,
            text: suggestion.afterText,
            claims: suggestion.claims,
            requirementIds: suggestion.requirementIds,
            explanation: suggestion.rationale,
          });
          validateResumeBulletSuggestion(validated, {
            targetBlockId: block.id,
            allowedRequirementIds: requirementIds,
            evidence,
            support: strongSupport.rows,
          });
        }
      }
      for (const [sequence, task] of input.taskResults.entries())
        await client.query(
          `INSERT INTO tailoring_task_results (workspace_id,run_id,sequence,task_id,task_version,provider_kind,model,attempts,input_hash,output_hash,usage,result)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)`,
          [
            principal.workspaceId,
            runId,
            sequence + 1,
            task.taskId,
            task.taskVersion,
            task.providerKind,
            task.model,
            task.attempts,
            task.inputHash,
            task.outputHash,
            JSON.stringify(task.usage),
            JSON.stringify(task.result),
          ],
        );
      for (const [sequence, suggestion] of input.suggestions.entries()) {
        const created = await client.query<{ id: string }>(
          `INSERT INTO tailoring_suggestions (workspace_id,run_id,sequence,operation,target_section_id,target_block_id,base_block_hash,before_text,after_text,rationale,task_id,task_version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [
            principal.workspaceId,
            runId,
            sequence + 1,
            suggestion.operation,
            suggestion.targetSectionId,
            suggestion.targetBlockId,
            suggestion.baseBlockHash,
            suggestion.beforeText,
            suggestion.afterText,
            suggestion.rationale,
            suggestion.taskId,
            suggestion.taskVersion,
          ],
        );
        const suggestionId = created.rows[0]!.id;
        for (const requirementId of new Set(suggestion.requirementIds))
          await client.query(
            `INSERT INTO tailoring_suggestion_requirements (workspace_id,suggestion_id,requirement_id) VALUES ($1,$2,$3)`,
            [principal.workspaceId, suggestionId, requirementId],
          );
        for (const claim of suggestion.claims) {
          const candidate = await client.query<{ id: string }>(
            `INSERT INTO tailoring_claim_candidates (workspace_id,suggestion_id,start_offset,end_offset,text_hash,relation) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [
              principal.workspaceId,
              suggestionId,
              claim.start,
              claim.end,
              tailoringHash(suggestion.afterText.slice(claim.start, claim.end)),
              claim.relation,
            ],
          );
          for (const evidenceFactId of new Set(claim.evidenceFactIds))
            await client.query(
              `INSERT INTO tailoring_claim_evidence (workspace_id,claim_candidate_id,evidence_fact_id) VALUES ($1,$2,$3)`,
              [principal.workspaceId, candidate.rows[0]!.id, evidenceFactId],
            );
        }
      }
      for (const gap of input.gaps)
        await client.query(
          `INSERT INTO tailoring_gaps (workspace_id,run_id,requirement_id,code,detail) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [
            principal.workspaceId,
            runId,
            gap.requirementId,
            gap.code,
            gap.detail,
          ],
        );
      await client.query(
        `UPDATE tailoring_runs SET status='ready',updated_at=now() WHERE id=$1 AND workspace_id=$2`,
        [runId, principal.workspaceId],
      );
      await audit(client, principal, "tailoring.ready", runId, {
        suggestionCount: input.suggestions.length,
        gapCount: input.gaps.length,
      });
    });
  }

  public async failRun(
    principal: WorkspacePrincipal,
    runId: string,
    failureCode: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE tailoring_runs SET status='failed',failure_code=$3,completed_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status='generating'`,
      [runId, principal.workspaceId, failureCode.slice(0, 100)],
    );
  }

  public async reviewRun(
    principal: WorkspacePrincipal,
    runId: string,
    decisions: TailoringReviewDecision[],
  ): Promise<string | null> {
    return transaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`tailoring-review:${principal.workspaceId}:${runId}`],
      );
      const run = await client.query<{
        status: "ready" | "completed" | "discarded";
        document_id: string;
        base_version_id: string;
        current_version_id: string;
        kind: "resume" | "cover_letter";
        content: CanonicalDocument;
        manifest: TailoringRunManifest;
      }>(
        `SELECT r.status,r.document_id,r.base_version_id,d.current_version_id,r.kind,v.content,r.manifest
         FROM tailoring_runs r
         JOIN documents d ON d.id=r.document_id AND d.workspace_id=r.workspace_id
         JOIN document_versions v ON v.id=r.base_version_id AND v.workspace_id=r.workspace_id
         WHERE r.id=$1 AND r.workspace_id=$2 FOR UPDATE OF r,d`,
        [runId, principal.workspaceId],
      );
      const runRow = run.rows[0];
      if (!runRow) throw new TailoringNotFoundError();
      if (runRow.status === "completed") {
        const prior = await client.query<{ accepted_version_id: string }>(
          `SELECT accepted_version_id FROM tailoring_suggestions WHERE run_id=$1 AND workspace_id=$2 AND accepted_version_id IS NOT NULL LIMIT 1`,
          [runId, principal.workspaceId],
        );
        return prior.rows[0]?.accepted_version_id ?? null;
      }
      if (runRow.status === "discarded") return null;
      if (runRow.status !== "ready") throw new TailoringInputConflictError();
      if (runRow.current_version_id !== runRow.base_version_id)
        throw new TailoringStaleRunError();
      const suggestions = await client.query<{
        id: string;
        target_section_id: string;
        target_block_id: string;
        base_block_hash: string;
        before_text: string;
        after_text: string;
        task_id: string;
      }>(
        `SELECT id,target_section_id,target_block_id,base_block_hash,before_text,after_text,task_id
         FROM tailoring_suggestions
         WHERE run_id=$1 AND workspace_id=$2 AND status='pending'
         ORDER BY sequence FOR UPDATE`,
        [runId, principal.workspaceId],
      );
      const decisionById = new Map(
        decisions.map((decision) => [decision.suggestionId, decision]),
      );
      if (
        decisionById.size !== decisions.length ||
        decisionById.size !== suggestions.rows.length ||
        suggestions.rows.some((suggestion) => !decisionById.has(suggestion.id))
      )
        throw new TailoringInputConflictError();

      const currentLocks = await client.query<{
        target_type: "section" | "block" | "claim" | "fact";
        target_id: string;
      }>(
        `SELECT target_type,target_id FROM document_locks WHERE document_id=$1 AND workspace_id=$2`,
        [runRow.document_id, principal.workspaceId],
      );
      const lockedSections = new Set(
        currentLocks.rows
          .filter((lock) => lock.target_type === "section")
          .map((lock) => lock.target_id),
      );
      const lockedBlocks = new Set(
        currentLocks.rows
          .filter((lock) => lock.target_type === "block")
          .map((lock) => lock.target_id),
      );
      const claimLockIds = currentLocks.rows
        .filter((lock) => lock.target_type === "claim")
        .map((lock) => lock.target_id);
      if (claimLockIds.length) {
        const rows = await client.query<{ stable_block_id: string }>(
          `SELECT stable_block_id FROM generated_claims WHERE version_id=$1 AND workspace_id=$2 AND id=ANY($3::uuid[])`,
          [runRow.base_version_id, principal.workspaceId, claimLockIds],
        );
        rows.rows.forEach((row) => lockedBlocks.add(row.stable_block_id));
      }
      const factLockIds = currentLocks.rows
        .filter((lock) => lock.target_type === "fact")
        .map((lock) => lock.target_id);
      if (factLockIds.length) {
        const rows = await client.query<{ stable_block_id: string }>(
          `SELECT DISTINCT c.stable_block_id
           FROM generated_claims c
           JOIN claim_evidence ce ON ce.claim_id=c.id AND ce.workspace_id=c.workspace_id
           WHERE c.version_id=$1 AND c.workspace_id=$2 AND ce.evidence_fact_id=ANY($3::uuid[])`,
          [runRow.base_version_id, principal.workspaceId, factLockIds],
        );
        rows.rows.forEach((row) => lockedBlocks.add(row.stable_block_id));
      }

      const content = structuredClone(runRow.content);
      const accepted: Array<{
        suggestion: (typeof suggestions.rows)[number];
        editedText: string;
        exact: boolean;
      }> = [];
      for (const suggestion of suggestions.rows) {
        const decision = decisionById.get(suggestion.id)!;
        if (decision.decision === "rejected") continue;
        const section = content.sections.find(
          (item) => item.id === suggestion.target_section_id,
        );
        const block = section?.blocks.find(
          (item) => item.id === suggestion.target_block_id,
        );
        if (
          !section ||
          !block ||
          lockedSections.has(section.id) ||
          lockedBlocks.has(block.id) ||
          runRow.manifest.lockedBlockIds.includes(block.id) ||
          contentHash(block) !== suggestion.base_block_hash ||
          block.text !== suggestion.before_text ||
          decision.editedText.length > 20_000
        )
          throw new TailoringInputConflictError();
        block.text = decision.editedText;
        accepted.push({
          suggestion,
          editedText: decision.editedText,
          exact: decision.editedText === suggestion.after_text,
        });
      }
      const validatedContent = canonicalDocumentSchema.parse(content);
      if (!accepted.length) {
        for (const suggestion of suggestions.rows)
          await client.query(
            `UPDATE tailoring_suggestions SET status='rejected',decided_by_user_id=$3,decided_at=now() WHERE id=$1 AND workspace_id=$2`,
            [suggestion.id, principal.workspaceId, principal.userId],
          );
        await client.query(
          `UPDATE tailoring_runs SET status='discarded',completed_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2`,
          [runId, principal.workspaceId],
        );
        await audit(client, principal, "tailoring.discard", runId, {
          rejectedCount: suggestions.rows.length,
        });
        return null;
      }

      for (const item of accepted) {
        if (
          !item.exact ||
          item.suggestion.task_id === "deterministic-letter-framing"
        )
          continue;
        const candidateRows = await client.query<{
          id: string;
          start_offset: number;
          end_offset: number;
          text_hash: string;
          relation: "direct" | "combines" | "paraphrases";
          evidence_fact_id: string | null;
          display_text: string | null;
          value: unknown;
          fact_status: string | null;
          entry_status: string | null;
          selected_evidence_fact_id: string | null;
        }>(
          `SELECT c.id,c.start_offset,c.end_offset,c.text_hash,c.relation,
                  ce.evidence_fact_id,f.display_text,f.value,f.status fact_status,
                  e.status entry_status,re.evidence_fact_id selected_evidence_fact_id
           FROM tailoring_claim_candidates c
           LEFT JOIN tailoring_claim_evidence ce ON ce.claim_candidate_id=c.id AND ce.workspace_id=c.workspace_id
           LEFT JOIN evidence_facts f ON f.id=ce.evidence_fact_id AND f.workspace_id=ce.workspace_id
           LEFT JOIN career_entries e ON e.id=f.career_entry_id AND e.workspace_id=f.workspace_id
           LEFT JOIN tailoring_run_evidence re ON re.run_id=$1 AND re.workspace_id=c.workspace_id AND re.evidence_fact_id=f.id
           WHERE c.suggestion_id=$2 AND c.workspace_id=$3
           ORDER BY c.start_offset,c.id,ce.evidence_fact_id`,
          [runId, item.suggestion.id, principal.workspaceId],
        );
        const claims = new Map<
          string,
          Omit<DocumentGroundingClaim, "stableBlockId">
        >();
        for (const row of candidateRows.rows) {
          const claim = claims.get(row.id) ?? {
            id: row.id,
            startOffset: row.start_offset,
            endOffset: row.end_offset,
            textHash: row.text_hash,
            status: "supported" as const,
            relation: row.relation,
            evidence: [],
          };
          if (row.evidence_fact_id && row.display_text !== null)
            claim.evidence.push({
              id: row.evidence_fact_id,
              displayText: row.display_text,
              value: row.value,
              factStatus:
                row.selected_evidence_fact_id === null
                  ? "not-selected"
                  : (row.fact_status ?? "missing"),
              entryStatus: row.entry_status ?? "missing",
            });
          claims.set(row.id, claim);
        }
        if (
          assessTextGrounding(item.editedText, [...claims.values()])
            .unsupportedClaimIds.length > 0
        )
          throw new TailoringInputConflictError();
      }

      const version = await client.query<{ id: string }>(
        `INSERT INTO document_versions (workspace_id,document_id,parent_version_id,author_user_id,reason,content,content_hash)
         VALUES ($1,$2,$3,$4,'tailoring',$5::jsonb,$6) RETURNING id`,
        [
          principal.workspaceId,
          runRow.document_id,
          runRow.base_version_id,
          principal.userId,
          JSON.stringify(validatedContent),
          contentHash(validatedContent),
        ],
      );
      const versionId = version.rows[0]!.id;
      for (const [position, section] of validatedContent.sections.entries())
        await client.query(
          `INSERT INTO document_sections (workspace_id,version_id,stable_section_id,section_type,heading,position,content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            principal.workspaceId,
            versionId,
            section.id,
            section.type,
            section.heading ?? null,
            position,
            contentHash(section),
          ],
        );
      const changedBlocks = new Set(
        accepted.map((item) => item.suggestion.target_block_id),
      );
      const inheritedClaims = await client.query<{
        id: string;
        stable_block_id: string;
        start_offset: number;
        end_offset: number;
        text_hash: string;
        status: string;
      }>(
        `SELECT id,stable_block_id,start_offset,end_offset,text_hash,status FROM generated_claims WHERE version_id=$1 AND workspace_id=$2`,
        [runRow.base_version_id, principal.workspaceId],
      );
      for (const claim of inheritedClaims.rows) {
        if (changedBlocks.has(claim.stable_block_id)) continue;
        const created = await client.query<{ id: string }>(
          `INSERT INTO generated_claims (workspace_id,version_id,stable_block_id,start_offset,end_offset,text_hash,status,source_claim_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [
            principal.workspaceId,
            versionId,
            claim.stable_block_id,
            claim.start_offset,
            claim.end_offset,
            claim.text_hash,
            claim.status,
            claim.id,
          ],
        );
        if (claim.status === "supported")
          await client.query(
            `INSERT INTO claim_evidence (workspace_id,claim_id,evidence_fact_id)
             SELECT workspace_id,$3,evidence_fact_id FROM claim_evidence WHERE claim_id=$1 AND workspace_id=$2`,
            [claim.id, principal.workspaceId, created.rows[0]!.id],
          );
      }
      for (const item of accepted) {
        if (!item.editedText) continue;
        if (
          item.exact &&
          item.suggestion.task_id === "deterministic-letter-framing"
        ) {
          await client.query(
            `INSERT INTO generated_claims (workspace_id,version_id,stable_block_id,start_offset,end_offset,text_hash,status)
             VALUES ($1,$2,$3,0,$4,$5,'nonfactual')`,
            [
              principal.workspaceId,
              versionId,
              item.suggestion.target_block_id,
              item.editedText.length,
              contentHash(item.editedText),
            ],
          );
        } else if (item.exact) {
          const claims = await client.query<{
            id: string;
            start_offset: number;
            end_offset: number;
            text_hash: string;
          }>(
            `SELECT id,start_offset,end_offset,text_hash FROM tailoring_claim_candidates WHERE suggestion_id=$1 AND workspace_id=$2 ORDER BY start_offset`,
            [item.suggestion.id, principal.workspaceId],
          );
          for (const claim of claims.rows) {
            const created = await client.query<{ id: string }>(
              `INSERT INTO generated_claims (workspace_id,version_id,stable_block_id,start_offset,end_offset,text_hash,status)
               VALUES ($1,$2,$3,$4,$5,$6,'supported') RETURNING id`,
              [
                principal.workspaceId,
                versionId,
                item.suggestion.target_block_id,
                claim.start_offset,
                claim.end_offset,
                claim.text_hash,
              ],
            );
            await client.query(
              `INSERT INTO claim_evidence (workspace_id,claim_id,evidence_fact_id)
               SELECT workspace_id,$3,evidence_fact_id FROM tailoring_claim_evidence WHERE claim_candidate_id=$1 AND workspace_id=$2`,
              [claim.id, principal.workspaceId, created.rows[0]!.id],
            );
          }
        } else {
          await client.query(
            `INSERT INTO generated_claims (workspace_id,version_id,stable_block_id,start_offset,end_offset,text_hash,status)
             VALUES ($1,$2,$3,0,$4,$5,'unverified')`,
            [
              principal.workspaceId,
              versionId,
              item.suggestion.target_block_id,
              item.editedText.length,
              contentHash(item.editedText),
            ],
          );
        }
      }
      for (const suggestion of suggestions.rows) {
        const decision = decisionById.get(suggestion.id)!;
        const acceptedItem = accepted.find(
          (item) => item.suggestion.id === suggestion.id,
        );
        await client.query(
          `UPDATE tailoring_suggestions
           SET status=$3,decided_by_user_id=$4,decided_at=now(),accepted_version_id=$5,edited_text_hash=$6
           WHERE id=$1 AND workspace_id=$2`,
          [
            suggestion.id,
            principal.workspaceId,
            decision.decision,
            principal.userId,
            decision.decision === "accepted" ? versionId : null,
            acceptedItem && !acceptedItem.exact
              ? contentHash(acceptedItem.editedText)
              : null,
          ],
        );
      }
      await client.query(
        `UPDATE documents SET current_version_id=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND workspace_id=$2`,
        [runRow.document_id, principal.workspaceId, versionId],
      );
      await client.query(
        `DELETE FROM document_drafts WHERE document_id=$1 AND workspace_id=$2 AND user_id=$3`,
        [runRow.document_id, principal.workspaceId, principal.userId],
      );
      await client.query(
        `UPDATE tailoring_runs SET status='completed',completed_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2`,
        [runId, principal.workspaceId],
      );
      await audit(client, principal, "tailoring.review", runId, {
        acceptedCount: accepted.length,
        rejectedCount: suggestions.rows.length - accepted.length,
        editedCount: accepted.filter((item) => !item.exact).length,
        versionId,
      });
      return versionId;
    });
  }

  public async getRun(
    principal: WorkspacePrincipal,
    runId: string,
  ): Promise<TailoringRunView> {
    const run = await this.pool.query<TailoringRunView["run"]>(
      `SELECT r.id,r.kind,r.status,r.failure_code,r.manifest,r.document_id,d.title document_title,j.title job_title,r.created_at
       FROM tailoring_runs r
       JOIN documents d ON d.id=r.document_id AND d.workspace_id=r.workspace_id
       JOIN job_posting_revisions jr ON jr.id=r.job_posting_revision_id AND jr.workspace_id=r.workspace_id
       JOIN job_postings j ON j.id=jr.job_posting_id AND j.workspace_id=jr.workspace_id
       WHERE r.id=$1 AND r.workspace_id=$2`,
      [runId, principal.workspaceId],
    );
    if (!run.rows[0]) throw new TailoringNotFoundError();
    const suggestions = await this.pool.query<{
      id: string;
      sequence: number;
      operation: string;
      target_section_id: string;
      target_block_id: string | null;
      before_text: string | null;
      after_text: string | null;
      rationale: string;
      status: string;
    }>(
      `SELECT id,sequence,operation,target_section_id,target_block_id,before_text,after_text,rationale,status FROM tailoring_suggestions WHERE run_id=$1 AND workspace_id=$2 ORDER BY sequence`,
      [runId, principal.workspaceId],
    );
    const suggestionIds = suggestions.rows.map((item) => item.id);
    const requirementLinks = suggestionIds.length
      ? await this.pool.query<{
          suggestion_id: string;
          requirement_id: string;
        }>(
          `SELECT suggestion_id,requirement_id FROM tailoring_suggestion_requirements WHERE workspace_id=$1 AND suggestion_id=ANY($2::uuid[]) ORDER BY requirement_id`,
          [principal.workspaceId, suggestionIds],
        )
      : {
          rows: [] as Array<{ suggestion_id: string; requirement_id: string }>,
        };
    const claims = suggestionIds.length
      ? await this.pool.query<{
          id: string;
          suggestion_id: string;
          start_offset: number;
          end_offset: number;
          relation: string;
        }>(
          `SELECT id,suggestion_id,start_offset,end_offset,relation FROM tailoring_claim_candidates WHERE workspace_id=$1 AND suggestion_id=ANY($2::uuid[]) ORDER BY suggestion_id,start_offset`,
          [principal.workspaceId, suggestionIds],
        )
      : {
          rows: [] as Array<{
            id: string;
            suggestion_id: string;
            start_offset: number;
            end_offset: number;
            relation: string;
          }>,
        };
    const claimIds = claims.rows.map((claim) => claim.id);
    const evidenceLinks = claimIds.length
      ? await this.pool.query<{
          claim_candidate_id: string;
          evidence_fact_id: string;
          career_entry_id: string;
          display_text: string;
          source_label: string | null;
          status: string;
        }>(
          `SELECT ce.claim_candidate_id,ce.evidence_fact_id,f.career_entry_id,f.display_text,f.source_locator->>'label' source_label,f.status
           FROM tailoring_claim_evidence ce
           JOIN evidence_facts f ON f.id=ce.evidence_fact_id AND f.workspace_id=ce.workspace_id
           WHERE ce.workspace_id=$1 AND ce.claim_candidate_id=ANY($2::uuid[])
           ORDER BY ce.evidence_fact_id`,
          [principal.workspaceId, claimIds],
        )
      : {
          rows: [] as Array<{
            claim_candidate_id: string;
            evidence_fact_id: string;
            career_entry_id: string;
            display_text: string;
            source_label: string | null;
            status: string;
          }>,
        };
    const gaps = await this.pool.query<TailoringRunView["gaps"][number]>(
      `SELECT g.requirement_id,q.requirement_text,g.code,g.detail FROM tailoring_gaps g JOIN job_requirements q ON q.id=g.requirement_id AND q.workspace_id=g.workspace_id WHERE g.run_id=$1 AND g.workspace_id=$2 ORDER BY q.created_at,g.code`,
      [runId, principal.workspaceId],
    );
    return {
      run: run.rows[0],
      suggestions: suggestions.rows.map((suggestion) => ({
        ...suggestion,
        requirement_ids: requirementLinks.rows
          .filter((link) => link.suggestion_id === suggestion.id)
          .map((link) => link.requirement_id),
        claims: claims.rows
          .filter((claim) => claim.suggestion_id === suggestion.id)
          .map((claim) => ({
            id: claim.id,
            start_offset: claim.start_offset,
            end_offset: claim.end_offset,
            relation: claim.relation,
            evidence: evidenceLinks.rows
              .filter((link) => link.claim_candidate_id === claim.id)
              .map((link) => ({
                id: link.evidence_fact_id,
                entryId: link.career_entry_id,
                displayText: link.display_text,
                sourceLabel: link.source_label,
                status: link.status,
              })),
          })),
      })),
      gaps: gaps.rows,
    };
  }
}
