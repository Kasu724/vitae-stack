// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FilesystemArtifactStore } from "@/infrastructure/artifacts/filesystem-store";
import { createDatabaseConnection } from "@/infrastructure/database/connection";
import { migrateDatabase } from "@/infrastructure/database/migration";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { contentHash } from "@/modules/documents/hash";
import { DocumentRepository } from "@/modules/documents/repository";
import { UnsupportedExportClaimsError } from "@/modules/exports/domain";
import { ExportNotFoundError, ExportService } from "@/modules/exports/service";

let container: StartedPostgreSqlContainer;
let ownerPool: Pool;
let runtimePool: Pool;
let storageRoot: string;
let service: ExportService;
let first: WorkspacePrincipal;
let second: WorkspacePrincipal;

async function principal(label: string): Promise<WorkspacePrincipal> {
  const user = await runtimePool.query<{ id: string }>(
    "INSERT INTO users (email,name) VALUES ($1,$2) RETURNING id",
    [`${label}@example.test`, label],
  );
  const workspace = await runtimePool.query<{ id: string }>(
    "INSERT INTO workspaces (owner_user_id,name) VALUES ($1,$2) RETURNING id",
    [user.rows[0]!.id, `${label} workspace`],
  );
  await runtimePool.query(
    "INSERT INTO workspace_memberships (workspace_id,user_id) VALUES ($1,$2)",
    [workspace.rows[0]!.id, user.rows[0]!.id],
  );
  await runtimePool.query(
    "INSERT INTO career_profiles (workspace_id,display_name) VALUES ($1,$2)",
    [workspace.rows[0]!.id, label],
  );
  return {
    authenticatedAt: new Date(),
    mode: "password",
    userId: user.rows[0]!.id,
    workspaceId: workspace.rows[0]!.id,
  };
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.4-bookworm")
    .withDatabase("vitae_exports_test")
    .withUsername("postgres")
    .withPassword("synthetic-admin-password")
    .start();
  ownerPool = new Pool({ connectionString: container.getConnectionUri() });
  await ownerPool.query(
    "CREATE ROLE vitae_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD 'synthetic-runtime-password'",
  );
  await ownerPool.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  const migration = createDatabaseConnection(container.getConnectionUri());
  await migrateDatabase(migration.database);
  await migration.pool.end();
  runtimePool = new Pool({
    connectionString: `postgresql://vitae_app:synthetic-runtime-password@${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
  });
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "vitae-exports-"));
  service = new ExportService(
    runtimePool,
    new FilesystemArtifactStore(storageRoot),
  );
  first = await principal("exports-first");
  second = await principal("exports-second");
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await ownerPool?.end();
  await container?.stop();
  if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
});

describe("private document export artifacts", () => {
  it("validates, stores, reuses, authorizes, and blocks unsupported final output", async () => {
    const documents = new DocumentRepository(runtimePool);
    const documentId = await documents.create(first, {
      kind: "resume",
      title: "Synthetic private export",
    });
    const initial = await documents.get(first, documentId);
    const content = structuredClone(initial.currentVersion.content);
    content.sections[0]!.blocks[0]!.text = "alex@example.test";
    const experience = content.sections.find(
      (section) => section.type === "experience",
    )!;
    experience.blocks[0]!.text = "Built accessible synthetic systems.";
    let versionId = await documents.commitVersion(first, {
      documentId,
      baseVersionId: initial.currentVersion.id,
      content,
    });

    const entry = await runtimePool.query<{ id: string }>(
      `INSERT INTO career_entries (workspace_id,career_profile_id,type,title)
       SELECT $1,id,'custom','Export evidence' FROM career_profiles WHERE workspace_id=$1 RETURNING id`,
      [first.workspaceId],
    );
    for (const claimText of [
      "alex@example.test",
      "Built accessible synthetic systems.",
    ]) {
      const currentClaim = (await documents.listClaims(first, documentId)).find(
        (claim) => claim.text === claimText,
      )!;
      const fact = await runtimePool.query<{ id: string }>(
        `INSERT INTO evidence_facts
           (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
         VALUES ($1,$2,'statement',$3::jsonb,$4,$5::jsonb,$6) RETURNING id`,
        [
          first.workspaceId,
          entry.rows[0]!.id,
          JSON.stringify({ kind: "text", text: claimText }),
          claimText,
          JSON.stringify({ kind: "manual", label: "Export fixture" }),
          first.userId,
        ],
      );
      versionId = await documents.supportClaimWithEvidence(first, {
        documentId,
        claimId: currentClaim.id,
        evidenceFactId: fact.rows[0]!.id,
      });
    }

    const pdf = await service.generate(first, {
      documentId,
      versionId,
      format: "pdf",
    });
    expect(pdf).toMatchObject({
      classification: "final",
      format: "pdf",
      document_version_id: versionId,
    });
    expect(
      await service.generate(first, {
        documentId,
        versionId,
        format: "pdf",
      }),
    ).toMatchObject({ id: pdf.id });
    const downloaded = await service.getArtifact(first, pdf.id);
    expect(downloaded.bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    await expect(service.getArtifact(second, pdf.id)).rejects.toBeInstanceOf(
      ExportNotFoundError,
    );
    await expect(
      runtimePool.query(
        "UPDATE export_artifacts SET filename='tampered.pdf' WHERE id=$1",
        [pdf.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await runtimePool.query(
      `INSERT INTO generated_claims
         (workspace_id,version_id,stable_block_id,start_offset,end_offset,text_hash,status)
       VALUES ($1,$2,$3,0,$4,$5,'unverified')`,
      [
        first.workspaceId,
        versionId,
        experience.blocks[0]!.id,
        experience.blocks[0]!.text.length,
        contentHash(experience.blocks[0]!.text),
      ],
    );
    await expect(
      service.generate(first, { documentId, versionId, format: "docx" }),
    ).rejects.toBeInstanceOf(UnsupportedExportClaimsError);
    const draft = await service.generate(first, {
      documentId,
      versionId,
      format: "markdown",
    });
    expect(draft.classification).toBe("draft");
    expect(
      (await service.getArtifact(first, draft.id)).bytes.toString("utf8"),
    ).toContain("DRAFT");
  });
});
