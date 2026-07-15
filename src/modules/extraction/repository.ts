import type { Pool, PoolClient } from "@/infrastructure/database/sqlite-pool";

import type {
  EvidenceValue,
  ExtractionAnalysisMetadata,
  SourceLocatorValue,
} from "@/infrastructure/database/value-types";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import {
  aiExtractionOutputSchema,
  aiExtractionMetadataSchema,
  aiProposalEvidenceValue,
  extractionProposalEditSchema,
  deterministicStructuredCandidates,
  hashExtractionValue,
  MAX_EXTRACTION_PROPOSALS,
  sourceEntryTitle,
  validateExtractionSourceSpans,
  type AiExtractionProposal,
  type AiExtractionMetadata,
  type ExtractionProposalEdit,
} from "./domain";

export class ExtractionNotFoundError extends Error {
  public constructor() {
    super("The requested resource is unavailable.");
    this.name = "ExtractionNotFoundError";
  }
}
export class ExtractionConflictError extends Error {
  public constructor(
    message = "This proposal changed or was already resolved.",
  ) {
    super(message);
    this.name = "ExtractionConflictError";
  }
}

function validatedBulkProposalIds(proposalIds: string[]): string[] {
  const uniqueIds = [...new Set(proposalIds)];
  if (
    uniqueIds.length === 0 ||
    uniqueIds.length > MAX_EXTRACTION_PROPOSALS ||
    uniqueIds.length !== proposalIds.length
  )
    throw new ExtractionConflictError(
      `Select between 1 and ${MAX_EXTRACTION_PROPOSALS} unique pending proposals.`,
    );
  return uniqueIds;
}

export interface ExtractionBatchRecord {
  id: string;
  source_document_id: string;
  target_career_entry_id: string | null;
  method: "deterministic" | "ai";
  task_version: string;
  metadata: Partial<ExtractionAnalysisMetadata>;
  status: "pending" | "completed" | "cancelled";
  original_name: string;
  extracted_text: string;
  source_available: boolean;
}
export interface ExtractionProposalRecord {
  id: string;
  batch_id: string;
  proposed_entry_key: string | null;
  target_career_entry_id: string | null;
  proposed_entry_type: string;
  proposed_entry_title: string;
  fact_type: string;
  proposed_value: EvidenceValue;
  display_text: string;
  source_locator: SourceLocatorValue;
  status: "pending" | "approved" | "rejected" | "merged";
  duplicate_of_fact_id: string | null;
  approved_fact_id: string | null;
  revision: number;
}

async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
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
  metadata: Record<string, string | number | boolean | null> = {},
) {
  await client.query(
    `INSERT INTO audit_events (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata) VALUES ($1,$2,$3,'extraction_batch',$4,'succeeded',$5,$6::jsonb)`,
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

async function completeIfResolved(
  client: PoolClient,
  workspaceId: string,
  batchId: string,
) {
  await client.query(
    `UPDATE extraction_batches b SET status='completed',completed_at=now(),updated_at=now() WHERE b.id=$1 AND b.workspace_id=$2 AND b.status='pending' AND NOT EXISTS (SELECT 1 FROM extraction_proposals p WHERE p.batch_id=b.id AND p.workspace_id=b.workspace_id AND p.status='pending')`,
    [batchId, workspaceId],
  );
}

export class ExtractionRepository {
  public constructor(private readonly pool: Pool) {}

  public async findPendingBatchId(
    principal: WorkspacePrincipal,
    sourceId: string,
  ): Promise<string | null> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM extraction_batches WHERE workspace_id=$1 AND source_document_id=$2 AND status='pending' ORDER BY created_at DESC LIMIT 1`,
      [principal.workspaceId, sourceId],
    );
    return result.rows[0]?.id ?? null;
  }

  public async createDeterministicBatch(
    principal: WorkspacePrincipal,
    sourceId: string,
  ): Promise<string> {
    return transaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`extract:${principal.workspaceId}:${sourceId}`],
      );
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM extraction_batches WHERE workspace_id=$1 AND source_document_id=$2 AND status='pending' ORDER BY created_at DESC LIMIT 1`,
        [principal.workspaceId, sourceId],
      );
      if (existing.rows[0]) return existing.rows[0].id;
      const source = await client.query<{
        original_name: string;
        extracted_text: string;
      }>(
        `SELECT original_name,extracted_text FROM source_documents WHERE id=$1 AND workspace_id=$2 AND status='ready' AND purpose<>'job_description' FOR UPDATE`,
        [sourceId, principal.workspaceId],
      );
      const row = source.rows[0];
      if (!row) throw new ExtractionNotFoundError();
      const candidates = deterministicStructuredCandidates(
        row.extracted_text,
        sourceEntryTitle(row.original_name),
      );
      if (!candidates.length)
        throw new ExtractionConflictError(
          "No extractable candidate lines were found.",
        );
      const metadata: ExtractionAnalysisMetadata = {
        schemaVersion: 1,
        taskVersion: "deterministic-sections@2",
        warnings: candidates.length
          ? ["Section and item grouping is heuristic and requires review."]
          : [],
        inputHash: hashExtractionValue(row.extracted_text),
        outputHash: hashExtractionValue(candidates),
      };
      const batch = await client.query<{ id: string }>(
        `INSERT INTO extraction_batches (workspace_id,source_document_id,method,task_version,metadata,created_by_user_id) VALUES ($1,$2,'deterministic','deterministic-sections@2',$3::jsonb,$4) RETURNING id`,
        [
          principal.workspaceId,
          sourceId,
          JSON.stringify(metadata),
          principal.userId,
        ],
      );
      const batchId = batch.rows[0]!.id;
      for (const candidate of candidates) {
        const duplicate = await client.query<{ id: string }>(
          `SELECT id FROM evidence_facts WHERE workspace_id=$1 AND status='approved' AND lower(display_text)=lower($2) ORDER BY approved_at LIMIT 1`,
          [principal.workspaceId, candidate.text],
        );
        const locator: SourceLocatorValue = {
          kind: "document",
          label: `Line ${candidate.line}`,
          section: `Line ${candidate.line} · ${candidate.sectionLabel}`,
          sourceDocumentId: sourceId,
        };
        const value: EvidenceValue = { kind: "text", text: candidate.text };
        await client.query(
          `INSERT INTO extraction_proposals (workspace_id,batch_id,source_document_id,proposed_entry_key,proposed_entry_type,proposed_entry_title,fact_type,proposed_value,display_text,source_locator,duplicate_of_fact_id) VALUES ($1,$2,$3,$4,$5,$6,'statement',$7::jsonb,$8,$9::jsonb,$10)`,
          [
            principal.workspaceId,
            batchId,
            sourceId,
            candidate.entryKey,
            candidate.entryType,
            candidate.entryTitle,
            JSON.stringify(value),
            candidate.text,
            JSON.stringify(locator),
            duplicate.rows[0]?.id ?? null,
          ],
        );
      }
      await audit(client, principal, "extraction.create", batchId, {
        candidateCount: candidates.length,
        method: "deterministic",
      });
      return batchId;
    });
  }

  public async createAiBatch(
    principal: WorkspacePrincipal,
    input: {
      sourceId: string;
      expectedSourceContentHash: string;
      proposals: AiExtractionProposal[];
      metadata: AiExtractionMetadata;
    },
  ): Promise<string> {
    const metadata = aiExtractionMetadataSchema.parse(input.metadata);
    const output = aiExtractionOutputSchema.parse({
      schemaVersion: "ai-01.v1",
      proposals: input.proposals,
      warnings: [],
    });
    return transaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`extract:${principal.workspaceId}:${input.sourceId}`],
      );
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM extraction_batches WHERE workspace_id=$1 AND source_document_id=$2 AND status='pending' ORDER BY created_at DESC LIMIT 1`,
        [principal.workspaceId, input.sourceId],
      );
      if (existing.rows[0]) return existing.rows[0].id;
      const source = await client.query<{
        content_hash: string;
        extracted_text: string;
      }>(
        `SELECT content_hash,extracted_text FROM source_documents WHERE id=$1 AND workspace_id=$2 AND status='ready' AND purpose<>'job_description'`,
        [input.sourceId, principal.workspaceId],
      );
      const row = source.rows[0];
      if (
        !row ||
        row.content_hash !== input.expectedSourceContentHash ||
        hashExtractionValue(row.extracted_text) !== metadata.inputHash
      )
        throw new ExtractionConflictError(
          "The source changed before AI extraction could be saved.",
        );
      validateExtractionSourceSpans(row.extracted_text, output.proposals);
      const status = output.proposals.length ? "pending" : "completed";
      const batch = await client.query<{ id: string }>(
        `INSERT INTO extraction_batches (workspace_id,source_document_id,method,task_version,metadata,status,completed_at,created_by_user_id) VALUES ($1,$2,'ai','ai-01.v1',$3::jsonb,$4,CASE WHEN $4='completed' THEN now() ELSE NULL END,$5) RETURNING id`,
        [
          principal.workspaceId,
          input.sourceId,
          JSON.stringify(metadata),
          status,
          principal.userId,
        ],
      );
      const batchId = batch.rows[0]!.id;
      for (const proposal of output.proposals) {
        const duplicate = await client.query<{ id: string }>(
          `SELECT id FROM evidence_facts WHERE workspace_id=$1 AND status='approved' AND lower(display_text)=lower($2) ORDER BY approved_at LIMIT 1`,
          [principal.workspaceId, proposal.sourceText],
        );
        const locator: SourceLocatorValue = {
          kind: "document",
          label: `Characters ${proposal.sourceStart}-${proposal.sourceEnd}`,
          section: `Characters ${proposal.sourceStart}-${proposal.sourceEnd}`,
          sourceDocumentId: input.sourceId,
          startOffset: proposal.sourceStart,
          endOffset: proposal.sourceEnd,
        };
        const value = aiProposalEvidenceValue(proposal);
        await client.query(
          `INSERT INTO extraction_proposals (workspace_id,batch_id,source_document_id,proposed_entry_key,proposed_entry_type,proposed_entry_title,fact_type,proposed_value,display_text,source_locator,duplicate_of_fact_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11)`,
          [
            principal.workspaceId,
            batchId,
            input.sourceId,
            proposal.entryKey,
            proposal.entryType,
            proposal.entryTitleText,
            proposal.factType,
            JSON.stringify(value),
            proposal.sourceText,
            JSON.stringify(locator),
            duplicate.rows[0]?.id ?? null,
          ],
        );
      }
      await audit(client, principal, "extraction.create", batchId, {
        attempts: metadata.attempts,
        candidateCount: output.proposals.length,
        inputHash: metadata.inputHash,
        method: "ai",
        model: metadata.model,
        outputHash: metadata.outputHash,
        providerConfigurationId: metadata.providerConfigurationId,
        taskVersion: "ai-01.v1",
      });
      return batchId;
    });
  }

  public async getBatch(
    principal: WorkspacePrincipal,
    batchId: string,
  ): Promise<{
    batch: ExtractionBatchRecord;
    proposals: ExtractionProposalRecord[];
    entries: Array<{ id: string; title: string; type: string }>;
  }> {
    const batch = await this.pool.query<ExtractionBatchRecord>(
      `SELECT b.id,b.source_document_id,b.target_career_entry_id,b.method,b.task_version,b.metadata,b.status,s.original_name,COALESCE(s.extracted_text,'') extracted_text,(s.status<>'deleted' AND s.extracted_text IS NOT NULL) source_available FROM extraction_batches b JOIN source_documents s ON s.id=b.source_document_id AND s.workspace_id=b.workspace_id WHERE b.id=$1 AND b.workspace_id=$2`,
      [batchId, principal.workspaceId],
    );
    if (!batch.rows[0]) throw new ExtractionNotFoundError();
    const [proposals, entries] = await Promise.all([
      this.pool.query<ExtractionProposalRecord>(
        `SELECT id,batch_id,proposed_entry_key,target_career_entry_id,proposed_entry_type,proposed_entry_title,fact_type,proposed_value,display_text,source_locator,status,duplicate_of_fact_id,approved_fact_id,revision
         FROM extraction_proposals
         WHERE batch_id=$1 AND workspace_id=$2
         ORDER BY COALESCE(
           CASE
             WHEN source_locator->>'section' ~ '^Line [0-9]+'
             THEN CAST(split_part(source_locator->>'section',' ',2) AS INTEGER)
           END,
           CAST(source_locator->>'startOffset' AS INTEGER)
         ) NULLS LAST,created_at,id`,
        [batchId, principal.workspaceId],
      ),
      this.pool.query<{ id: string; title: string; type: string }>(
        `SELECT id,title,type FROM career_entries WHERE workspace_id=$1 AND status='active' ORDER BY lower(title),id`,
        [principal.workspaceId],
      ),
    ]);
    return {
      batch: batch.rows[0],
      proposals: proposals.rows,
      entries: entries.rows,
    };
  }

  public async updateProposal(
    principal: WorkspacePrincipal,
    proposalId: string,
    expectedRevision: number,
    raw: ExtractionProposalEdit,
  ): Promise<void> {
    const input = extractionProposalEditSchema.parse(raw);
    await transaction(this.pool, async (client) => {
      const result = await client.query<{ batch_id: string }>(
        `UPDATE extraction_proposals SET target_career_entry_id=$3,proposed_entry_key=CASE WHEN proposed_entry_key IS NULL THEN NULL ELSE id END,proposed_entry_type=$4,proposed_entry_title=$5,fact_type=$6,proposed_value=$7::jsonb,display_text=$8,revision=revision+1,updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status='pending' AND revision=$9 RETURNING batch_id`,
        [
          proposalId,
          principal.workspaceId,
          input.targetCareerEntryId ?? null,
          input.entryType,
          input.entryTitle,
          input.fact.type,
          JSON.stringify(input.fact.value),
          input.fact.displayText,
          expectedRevision,
        ],
      );
      if (!result.rows[0]) throw new ExtractionConflictError();
      await audit(
        client,
        principal,
        "extraction.proposal-edit",
        result.rows[0].batch_id,
        { proposalId },
      );
    });
  }

  private async approveLocked(
    client: PoolClient,
    principal: WorkspacePrincipal,
    proposalId: string,
  ): Promise<{ batchId: string; factId: string }> {
    const proposal = await client.query<
      ExtractionProposalRecord & { source_document_id: string }
    >(
      `SELECT id,batch_id,source_document_id,proposed_entry_key,target_career_entry_id,proposed_entry_type,proposed_entry_title,fact_type,proposed_value,display_text,source_locator,status,duplicate_of_fact_id,approved_fact_id,revision FROM extraction_proposals WHERE id=$1 AND workspace_id=$2 FOR UPDATE`,
      [proposalId, principal.workspaceId],
    );
    const row = proposal.rows[0];
    if (!row) throw new ExtractionNotFoundError();
    if (row.status !== "pending") throw new ExtractionConflictError();
    const batch = await client.query<{
      method: "deterministic" | "ai";
      target_career_entry_id: string | null;
    }>(
      `SELECT method,target_career_entry_id FROM extraction_batches WHERE id=$1 AND workspace_id=$2 FOR UPDATE`,
      [row.batch_id, principal.workspaceId],
    );
    const batchRow = batch.rows[0];
    let entryId = row.target_career_entry_id ?? null;
    if (!entryId && batchRow?.method === "deterministic")
      entryId = batchRow.target_career_entry_id;
    if (!entryId && row.proposed_entry_key) {
      const grouped = await client.query<{ target_career_entry_id: string }>(
        `SELECT target_career_entry_id FROM extraction_proposals WHERE batch_id=$1 AND workspace_id=$2 AND proposed_entry_key=$3 AND target_career_entry_id IS NOT NULL ORDER BY resolved_at,created_at,id LIMIT 1`,
        [row.batch_id, principal.workspaceId, row.proposed_entry_key],
      );
      entryId = grouped.rows[0]?.target_career_entry_id ?? null;
    }
    if (!entryId) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO career_entries (workspace_id,career_profile_id,type,title) SELECT $1,id,$2,$3 FROM career_profiles WHERE workspace_id=$1 RETURNING id`,
        [
          principal.workspaceId,
          row.proposed_entry_type,
          row.proposed_entry_title,
        ],
      );
      entryId = created.rows[0]?.id ?? null;
      if (!entryId) throw new ExtractionNotFoundError();
      if (batchRow?.method === "deterministic" && !row.proposed_entry_key)
        await client.query(
          `UPDATE extraction_batches SET target_career_entry_id=$3,updated_at=now() WHERE id=$1 AND workspace_id=$2`,
          [row.batch_id, principal.workspaceId, entryId],
        );
    } else {
      const owned = await client.query(
        `SELECT 1 FROM career_entries WHERE id=$1 AND workspace_id=$2`,
        [entryId, principal.workspaceId],
      );
      if (!owned.rowCount) throw new ExtractionNotFoundError();
    }
    const fact = await client.query<{ id: string }>(
      `INSERT INTO evidence_facts (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id) VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7) RETURNING id`,
      [
        principal.workspaceId,
        entryId,
        row.fact_type,
        JSON.stringify(row.proposed_value),
        row.display_text,
        JSON.stringify(row.source_locator),
        principal.userId,
      ],
    );
    const factId = fact.rows[0]!.id;
    await client.query(
      `UPDATE extraction_proposals SET status='approved',target_career_entry_id=$3,approved_fact_id=$4,resolved_by_user_id=$5,resolved_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2`,
      [proposalId, principal.workspaceId, entryId, factId, principal.userId],
    );
    return { batchId: row.batch_id, factId };
  }

  public async approve(
    principal: WorkspacePrincipal,
    proposalId: string,
  ): Promise<string> {
    return transaction(this.pool, async (client) => {
      const result = await this.approveLocked(client, principal, proposalId);
      await completeIfResolved(client, principal.workspaceId, result.batchId);
      await audit(client, principal, "extraction.approve", result.batchId, {
        factId: result.factId,
        proposalId,
      });
      return result.factId;
    });
  }

  public async reject(
    principal: WorkspacePrincipal,
    proposalId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query<{ batch_id: string }>(
        `UPDATE extraction_proposals SET status='rejected',resolved_by_user_id=$3,resolved_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status='pending' RETURNING batch_id`,
        [proposalId, principal.workspaceId, principal.userId],
      );
      if (!result.rows[0]) throw new ExtractionConflictError();
      await completeIfResolved(
        client,
        principal.workspaceId,
        result.rows[0].batch_id,
      );
      await audit(
        client,
        principal,
        "extraction.reject",
        result.rows[0].batch_id,
        { proposalId },
      );
    });
  }

  public async mergeDuplicate(
    principal: WorkspacePrincipal,
    proposalId: string,
  ): Promise<string> {
    return transaction(this.pool, async (client) => {
      const proposal = await client.query<{
        batch_id: string;
        duplicate_of_fact_id: string | null;
        status: string;
      }>(
        `SELECT batch_id,duplicate_of_fact_id,status FROM extraction_proposals WHERE id=$1 AND workspace_id=$2 FOR UPDATE`,
        [proposalId, principal.workspaceId],
      );
      const row = proposal.rows[0];
      if (!row || row.status !== "pending" || !row.duplicate_of_fact_id)
        throw new ExtractionConflictError();
      const duplicate = await client.query<{ id: string }>(
        `SELECT id FROM evidence_facts WHERE id=$1 AND workspace_id=$2 AND status='approved'`,
        [row.duplicate_of_fact_id, principal.workspaceId],
      );
      if (!duplicate.rows[0]) throw new ExtractionConflictError();
      await client.query(
        `UPDATE extraction_proposals SET status='merged',approved_fact_id=$3,resolved_by_user_id=$4,resolved_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2`,
        [
          proposalId,
          principal.workspaceId,
          row.duplicate_of_fact_id,
          principal.userId,
        ],
      );
      await completeIfResolved(client, principal.workspaceId, row.batch_id);
      await audit(client, principal, "extraction.merge", row.batch_id, {
        proposalId,
        existingFactId: row.duplicate_of_fact_id,
      });
      return row.duplicate_of_fact_id;
    });
  }

  public async bulkApprove(
    principal: WorkspacePrincipal,
    proposalIds: string[],
  ): Promise<string[]> {
    const uniqueIds = validatedBulkProposalIds(proposalIds);
    return transaction(this.pool, async (client) => {
      const facts: string[] = [];
      let batchId: string | null = null;
      for (const proposalId of uniqueIds) {
        const result = await this.approveLocked(client, principal, proposalId);
        if (batchId && batchId !== result.batchId)
          throw new ExtractionConflictError(
            "Bulk approval must use one extraction batch.",
          );
        batchId = result.batchId;
        facts.push(result.factId);
      }
      await completeIfResolved(client, principal.workspaceId, batchId!);
      await audit(client, principal, "extraction.bulk-approve", batchId!, {
        approvedCount: facts.length,
      });
      return facts;
    });
  }

  public async bulkReject(
    principal: WorkspacePrincipal,
    proposalIds: string[],
  ): Promise<void> {
    const uniqueIds = validatedBulkProposalIds(proposalIds);
    await transaction(this.pool, async (client) => {
      let batchId: string | null = null;
      for (const proposalId of uniqueIds) {
        const result = await client.query<{ batch_id: string }>(
          `UPDATE extraction_proposals SET status='rejected',resolved_by_user_id=$3,resolved_at=now(),updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status='pending' RETURNING batch_id`,
          [proposalId, principal.workspaceId, principal.userId],
        );
        const proposalBatchId = result.rows[0]?.batch_id;
        if (!proposalBatchId) throw new ExtractionConflictError();
        if (batchId && batchId !== proposalBatchId)
          throw new ExtractionConflictError(
            "Bulk rejection must use one extraction batch.",
          );
        batchId = proposalBatchId;
      }
      await completeIfResolved(client, principal.workspaceId, batchId!);
      await audit(client, principal, "extraction.bulk-reject", batchId!, {
        rejectedCount: uniqueIds.length,
      });
    });
  }
}
