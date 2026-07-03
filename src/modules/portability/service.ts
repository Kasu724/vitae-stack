import type { Pool, PoolClient } from "@/infrastructure/database/sqlite-pool";

import {
  exportArtifactStorageKey,
  FilesystemArtifactStore,
  sourceStorageKey,
} from "@/infrastructure/artifacts/filesystem-store";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { consumeApplicationRateLimit } from "@/infrastructure/security/rate-limit";

import {
  countForbiddenFields,
  forbiddenPortableFields,
  PORTABILITY_MAX_BYTES,
  PORTABILITY_SCHEMA_VERSION,
  PORTABLE_TABLES,
  portabilityArchiveSchema,
  type PortabilityArchive,
  type PortabilityPreview,
  type PortableTable,
  sha256,
} from "./domain";

type PortableRow = Record<string, unknown>;

export class PortabilityValidationError extends Error {
  public constructor(message = "The portability archive is invalid.") {
    super(message);
    this.name = "PortabilityValidationError";
  }
}

export class PortabilityConflictError extends Error {
  public constructor() {
    super("The target workspace is not empty or identifiers conflict.");
    this.name = "PortabilityConflictError";
  }
}

function tableRows(archive: PortabilityArchive, table: PortableTable) {
  return archive.tables[table] ?? [];
}

function sanitizeProvider(row: PortableRow): PortableRow {
  const sanitized: PortableRow = {
    ...row,
    auth_type: "none",
    status: "unverified",
  };
  for (const field of forbiddenPortableFields) delete sanitized[field];
  return sanitized;
}

function transformRow(
  row: PortableRow,
  table: PortableTable,
  principal: WorkspacePrincipal,
  profileMap: { source: string; target: string },
  blobKeys: Set<string>,
): PortableRow {
  const transformed: PortableRow = {
    ...row,
    workspace_id: principal.workspaceId,
  };
  for (const key of Object.keys(transformed)) {
    if (key.endsWith("_user_id") && transformed[key] !== null)
      transformed[key] = principal.userId;
    if (key === "career_profile_id" && transformed[key] === profileMap.source)
      transformed[key] = profileMap.target;
  }
  if (table === "model_provider_configurations")
    return sanitizeProvider(transformed);
  if (table === "source_documents") {
    const id = String(transformed.id);
    transformed.storage_key = sourceStorageKey(principal.workspaceId, id);
    if (!blobKeys.has(`source:${id}`)) {
      transformed.status = "deleted";
      transformed.extracted_text = null;
      transformed.deleted_at = new Date().toISOString();
    }
  }
  if (table === "export_artifacts") {
    transformed.storage_key = exportArtifactStorageKey(
      principal.workspaceId,
      String(transformed.id),
    );
  }
  return transformed;
}

function insertionRow(row: PortableRow, table: PortableTable): PortableRow {
  if (table === "documents") return { ...row, current_version_id: null };
  return row;
}

function parentFields(table: PortableTable): string[] {
  if (table === "document_versions")
    return ["parent_version_id", "restored_from_version_id"];
  if (table === "job_posting_revisions") return ["parent_revision_id"];
  if (table === "job_requirement_sets") return ["parent_set_id"];
  if (table === "evidence_facts") return ["supersedes_fact_id"];
  if (table === "generated_claims") return ["source_claim_id"];
  return [];
}

function parentFirst(rows: PortableRow[], table: PortableTable): PortableRow[] {
  const fields = parentFields(table);
  if (!fields.length) return rows;
  const remaining = [...rows];
  const emitted = new Set<string>();
  const allIds = new Set(
    rows
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string"),
  );
  const ordered: PortableRow[] = [];
  while (remaining.length) {
    const readyIndex = remaining.findIndex((row) =>
      fields.every((field) => {
        const parent = row[field];
        return (
          parent === null ||
          parent === undefined ||
          !allIds.has(String(parent)) ||
          emitted.has(String(parent))
        );
      }),
    );
    if (readyIndex < 0)
      throw new PortabilityValidationError(
        `Archive contains a cyclic ${table} history.`,
      );
    const [next] = remaining.splice(readyIndex, 1);
    ordered.push(next!);
    if (typeof next!.id === "string") emitted.add(next!.id);
  }
  return ordered;
}

async function insertRecord(
  client: PoolClient,
  table: PortableTable,
  row: PortableRow,
): Promise<void> {
  const columns = Object.keys(row);
  if (columns.length === 0) throw new PortabilityValidationError();
  const identifiers = columns.map(
    (column) => `"${column.replaceAll('"', '""')}"`,
  );
  await client.query(
    `INSERT INTO "${table}" (${identifiers.join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
    columns.map((column) => row[column]),
  );
}

export class PortabilityService {
  public constructor(
    private readonly pool: Pool,
    private readonly store: FilesystemArtifactStore,
  ) {}

  public async exportArchive(
    principal: WorkspacePrincipal,
    options: { includeSources: boolean; includeArtifacts: boolean },
  ): Promise<Buffer> {
    await consumeApplicationRateLimit(this.pool, {
      scope: "portability-export",
      subject: principal.userId,
      limit: 5,
      windowMs: 60 * 60 * 1_000,
    });
    const tables: Record<string, PortableRow[]> = {};
    for (const table of PORTABLE_TABLES) {
      if (table === "export_artifacts" && !options.includeArtifacts) {
        tables[table] = [];
        continue;
      }
      const result = await this.pool.query<PortableRow>(
        `SELECT * FROM "${table}" WHERE workspace_id=$1`,
        [principal.workspaceId],
      );
      tables[table] = result.rows
        .map((row) =>
          table === "model_provider_configurations"
            ? sanitizeProvider(row)
            : row,
        )
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        );
    }

    const blobs: PortabilityArchive["blobs"] = [];
    const warnings: string[] = [];
    if (options.includeSources) {
      for (const row of tables.source_documents ?? []) {
        if (row.status === "deleted") continue;
        try {
          const bytes = await this.store.read(String(row.storage_key));
          blobs.push({
            kind: "source",
            resourceId: String(row.id),
            mediaType: String(row.detected_media_type),
            byteSize: bytes.length,
            contentHash: sha256(bytes),
            dataBase64: bytes.toString("base64"),
          });
        } catch {
          warnings.push(`Source ${String(row.id)} bytes were unavailable.`);
        }
      }
    }
    if (options.includeArtifacts) {
      const retained: PortableRow[] = [];
      for (const row of tables.export_artifacts ?? []) {
        try {
          const bytes = await this.store.read(String(row.storage_key));
          blobs.push({
            kind: "export",
            resourceId: String(row.id),
            mediaType: String(row.media_type),
            byteSize: bytes.length,
            contentHash: sha256(bytes),
            dataBase64: bytes.toString("base64"),
          });
          retained.push(row);
        } catch {
          warnings.push(`Export artifact ${String(row.id)} was unavailable.`);
        }
      }
      tables.export_artifacts = retained;
    }
    const archive: PortabilityArchive = {
      schemaVersion: PORTABILITY_SCHEMA_VERSION,
      product: "vitae-stack",
      exportedAt: new Date().toISOString(),
      sourceWorkspaceId: principal.workspaceId,
      options: {
        sources: options.includeSources,
        artifacts: options.includeArtifacts,
      },
      tables,
      blobs,
      warnings,
    };
    if (countForbiddenFields(archive) !== 0)
      throw new PortabilityValidationError(
        "A secret-bearing field was detected in the archive.",
      );
    const bytes = Buffer.from(`${JSON.stringify(archive, null, 2)}\n`, "utf8");
    if (bytes.length > PORTABILITY_MAX_BYTES)
      throw new PortabilityValidationError(
        "The archive exceeds the 50 MiB portability limit.",
      );
    portabilityArchiveSchema.parse(archive);
    return bytes;
  }

  public parse(bytes: Uint8Array): PortabilityArchive {
    if (bytes.length === 0 || bytes.length > PORTABILITY_MAX_BYTES)
      throw new PortabilityValidationError();
    try {
      const parsed = portabilityArchiveSchema.parse(
        JSON.parse(Buffer.from(bytes).toString("utf8")),
      );
      for (const blob of parsed.blobs) {
        const decoded = Buffer.from(blob.dataBase64, "base64");
        if (
          decoded.length !== blob.byteSize ||
          sha256(decoded) !== blob.contentHash
        )
          throw new PortabilityValidationError(
            `Blob ${blob.resourceId} failed integrity validation.`,
          );
      }
      return parsed;
    } catch (error) {
      if (error instanceof PortabilityValidationError) throw error;
      throw new PortabilityValidationError();
    }
  }

  public async preview(
    principal: WorkspacePrincipal,
    archive: PortabilityArchive,
  ): Promise<PortabilityPreview> {
    await consumeApplicationRateLimit(this.pool, {
      scope: "portability-import",
      subject: principal.userId,
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    });
    const tableCounts = Object.fromEntries(
      PORTABLE_TABLES.map((table) => [table, tableRows(archive, table).length]),
    );
    let existingRecordCount = 0;
    let identifierConflictCount = 0;
    for (const table of PORTABLE_TABLES) {
      if (table === "career_profiles" || table === "career_profile_settings")
        continue;
      const existing = await this.pool.query<{ count: string }>(
        `SELECT count(*)::text count FROM "${table}" WHERE workspace_id=$1`,
        [principal.workspaceId],
      );
      existingRecordCount += Number(existing.rows[0]!.count);
      const ids = tableRows(archive, table)
        .map((row) => row.id)
        .filter((id): id is string => typeof id === "string");
      if (ids.length) {
        const conflicts = await this.pool.query<{ count: string }>(
          `SELECT count(*)::text count FROM "${table}" WHERE id=ANY($1::uuid[])`,
          [ids],
        );
        identifierConflictCount += Number(conflicts.rows[0]!.count);
      }
    }
    const secretFieldCount = countForbiddenFields(archive);
    const reasons: string[] = [];
    if (existingRecordCount)
      reasons.push("The target workspace contains existing records.");
    if (identifierConflictCount)
      reasons.push("Archive identifiers already exist in this database.");
    if (secretFieldCount)
      reasons.push("The archive contains a secret-bearing field.");
    return {
      schemaVersion: 1,
      sourceWorkspaceId: archive.sourceWorkspaceId,
      tableCounts,
      existingRecordCount,
      identifierConflictCount,
      secretFieldCount,
      sourceBlobCount: archive.blobs.filter((blob) => blob.kind === "source")
        .length,
      artifactBlobCount: archive.blobs.filter((blob) => blob.kind === "export")
        .length,
      canApply: reasons.length === 0,
      reasons,
    };
  }

  public async importArchive(
    principal: WorkspacePrincipal,
    archive: PortabilityArchive,
  ): Promise<PortabilityPreview> {
    const preview = await this.preview(principal, archive);
    if (!preview.canApply) throw new PortabilityConflictError();
    const sourceProfile = tableRows(archive, "career_profiles")[0];
    if (!sourceProfile || typeof sourceProfile.id !== "string")
      throw new PortabilityValidationError("Archive has no career profile.");
    const targetProfile = await this.pool.query<{ id: string }>(
      "SELECT id FROM career_profiles WHERE workspace_id=$1",
      [principal.workspaceId],
    );
    if (!targetProfile.rows[0])
      throw new PortabilityValidationError("Target has no career profile.");
    const profileMap = {
      source: sourceProfile.id,
      target: targetProfile.rows[0].id,
    };
    const blobKeys = new Set(
      archive.blobs.map((blob) => `${blob.kind}:${blob.resourceId}`),
    );
    const writtenKeys: string[] = [];
    try {
      for (const blob of archive.blobs) {
        const key =
          blob.kind === "source"
            ? sourceStorageKey(principal.workspaceId, blob.resourceId)
            : exportArtifactStorageKey(principal.workspaceId, blob.resourceId);
        await this.store.putExclusive(
          key,
          Buffer.from(blob.dataBase64, "base64"),
        );
        writtenKeys.push(key);
      }
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`portability-import:${principal.workspaceId}`],
        );
        const sourceProfileSettings = tableRows(
          archive,
          "career_profile_settings",
        )[0];
        await client.query(
          `UPDATE career_profiles SET display_name=$2,headline=$3,revision=$4,updated_at=now()
           WHERE id=$1 AND workspace_id=$5`,
          [
            profileMap.target,
            sourceProfile.display_name,
            sourceProfile.headline ?? null,
            sourceProfile.revision ?? 1,
            principal.workspaceId,
          ],
        );
        if (sourceProfileSettings) {
          await client.query(
            `INSERT INTO career_profile_settings
               (workspace_id,career_profile_id,career_goals,target_roles,writing_preferences,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5::jsonb,now(),now())
             ON CONFLICT (workspace_id,career_profile_id) DO UPDATE SET
               career_goals=EXCLUDED.career_goals,target_roles=EXCLUDED.target_roles,
               writing_preferences=EXCLUDED.writing_preferences,updated_at=now()`,
            [
              principal.workspaceId,
              profileMap.target,
              sourceProfileSettings.career_goals ?? [],
              sourceProfileSettings.target_roles ?? [],
              JSON.stringify(sourceProfileSettings.writing_preferences ?? {}),
            ],
          );
        }
        for (const table of PORTABLE_TABLES) {
          if (
            table === "career_profiles" ||
            table === "career_profile_settings"
          )
            continue;
          for (const sourceRow of parentFirst(
            tableRows(archive, table),
            table,
          )) {
            const row = transformRow(
              sourceRow,
              table,
              principal,
              profileMap,
              blobKeys,
            );
            await insertRecord(client, table, insertionRow(row, table));
          }
        }
        for (const row of tableRows(archive, "documents")) {
          if (row.current_version_id)
            await client.query(
              "UPDATE documents SET current_version_id=$1 WHERE id=$2 AND workspace_id=$3",
              [row.current_version_id, row.id, principal.workspaceId],
            );
        }
        await client.query(
          `INSERT INTO audit_events
             (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata)
           VALUES ($1,$2,'portability.import','workspace',$1,'succeeded',$3,$4::jsonb)`,
          [
            principal.workspaceId,
            principal.userId,
            crypto.randomUUID(),
            JSON.stringify({
              schemaVersion: archive.schemaVersion,
              recordCount: Object.values(preview.tableCounts).reduce(
                (sum, count) => sum + count,
                0,
              ),
            }),
          ],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return preview;
    } catch (error) {
      await Promise.all(
        writtenKeys.map((key) => this.store.delete(key).catch(() => undefined)),
      );
      throw error;
    }
  }
}
