// @vitest-environment node

import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Pool } from "@/infrastructure/database/sqlite-pool";
import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../helpers/sqlite-test-database";
import {
  FilesystemArtifactStore,
  sourceStorageKey,
} from "@/infrastructure/artifacts/filesystem-store";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { DocumentRepository } from "@/modules/documents/repository";
import { PortabilityService } from "@/modules/portability/service";
import { WorkspaceDeletionService } from "@/modules/privacy/workspace-deletion-service";

let testDatabase: SqliteTestDatabase;
let runtimePool: Pool;
let storageRoot: string;
let parserRoot: string;
let fetchRoot: string;

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
    mode: "trusted-local",
    userId: user.rows[0]!.id,
    workspaceId: workspace.rows[0]!.id,
  };
}

beforeAll(async () => {
  testDatabase = await createSqliteTestDatabase("portability-deletion");
  runtimePool = testDatabase.pool;
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "vitae-portability-"));
  parserRoot = await mkdtemp(path.join(os.tmpdir(), "vitae-parser-delete-"));
  fetchRoot = await mkdtemp(path.join(os.tmpdir(), "vitae-fetch-delete-"));
}, 120_000);

afterAll(async () => {
  await testDatabase?.cleanup();
  for (const root of [storageRoot, parserRoot, fetchRoot])
    if (root) await rm(root, { recursive: true, force: true });
});

describe("portability and permanent deletion", () => {
  it("exports without credentials, deletes durably, and imports after a clean dry run", async () => {
    const first = await principal("portable-first");
    const profile = await runtimePool.query<{ id: string }>(
      "SELECT id FROM career_profiles WHERE workspace_id=$1",
      [first.workspaceId],
    );
    const entry = await runtimePool.query<{ id: string }>(
      `INSERT INTO career_entries (workspace_id,career_profile_id,type,title)
       VALUES ($1,$2,'project','Synthetic portable project') RETURNING id`,
      [first.workspaceId, profile.rows[0]!.id],
    );
    await runtimePool.query(
      `INSERT INTO evidence_facts
         (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
       VALUES ($1,$2,'statement',$3::jsonb,'Shipped a synthetic fixture',$4::jsonb,$5)`,
      [
        first.workspaceId,
        entry.rows[0]!.id,
        JSON.stringify({ kind: "text", text: "Shipped a synthetic fixture" }),
        JSON.stringify({ kind: "manual", label: "Synthetic fixture" }),
        first.userId,
      ],
    );
    await new DocumentRepository(runtimePool).create(first, {
      kind: "resume",
      title: "Portable synthetic resume",
    });
    await runtimePool.query(
      `INSERT INTO model_provider_configurations
         (workspace_id,created_by_user_id,kind,label,base_url,auth_type,
          credential_ciphertext,credential_nonce,credential_tag,credential_key_version,credential_last_four)
       VALUES ($1,$2,'openai_compatible','Synthetic remote','https://models.example/v1/',
         'encrypted','never-export-this','nonce','tag',1,'test')`,
      [first.workspaceId, first.userId],
    );
    const sourceId = crypto.randomUUID();
    const sourceKey = sourceStorageKey(first.workspaceId, sourceId);
    const store = new FilesystemArtifactStore(storageRoot);
    await store.putExclusive(sourceKey, Buffer.from("Synthetic source bytes"));
    await runtimePool.query(
      `INSERT INTO source_documents
         (id,workspace_id,uploaded_by_user_id,purpose,original_name,declared_media_type,
          detected_media_type,byte_size,content_hash,storage_key,status,extracted_text)
       VALUES ($1,$2,$3,'resume','synthetic.txt','text/plain','text/plain',22,
         $4,$5,'ready','Synthetic source bytes')`,
      [
        sourceId,
        first.workspaceId,
        first.userId,
        "sha256:e4a09098a57b57ab2dffaab4f40d92853a838d9c6580a930bef0506de6421bb6",
        sourceKey,
      ],
    );
    const posting = await runtimePool.query<{ id: string }>(
      `INSERT INTO job_postings (workspace_id,title)
       VALUES ($1,'Synthetic deletion fixture') RETURNING id`,
      [first.workspaceId],
    );
    const postingRevision = await runtimePool.query<{ id: string }>(
      `INSERT INTO job_posting_revisions
         (workspace_id,job_posting_id,input_method,revision_number,normalized_text,
          content_hash,created_by_user_id)
       VALUES ($1,$2,'text',1,'Synthetic reviewed requirement',
         'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',$3)
       RETURNING id`,
      [first.workspaceId, posting.rows[0]!.id, first.userId],
    );
    const requirementSet = await runtimePool.query<{ id: string }>(
      `INSERT INTO job_requirement_sets
         (workspace_id,job_posting_revision_id,revision_number,method,status,
          metadata,created_by_user_id,reviewed_at)
       VALUES ($1,$2,1,'deterministic','reviewed','{}'::jsonb,$3,now())
       RETURNING id`,
      [first.workspaceId, postingRevision.rows[0]!.id, first.userId],
    );
    const requirement = await runtimePool.query<{ id: string }>(
      `INSERT INTO job_requirements
         (workspace_id,requirement_set_id,category,priority,decision,requirement_text)
       VALUES ($1,$2,'required_qualification','required','accepted',
         'Synthetic reviewed requirement') RETURNING id`,
      [first.workspaceId, requirementSet.rows[0]!.id],
    );
    const unauthorizedBypass = await runtimePool.connect();
    try {
      await unauthorizedBypass.query("BEGIN");
      await unauthorizedBypass.query(
        "SET LOCAL vitae.workspace_deletion = 'on'",
      );
      await expect(
        unauthorizedBypass.query("DELETE FROM job_requirements WHERE id=$1", [
          requirement.rows[0]!.id,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
      await unauthorizedBypass.query("ROLLBACK");
    } finally {
      unauthorizedBypass.release();
    }

    const portability = new PortabilityService(runtimePool, store);
    const archiveBytes = await portability.exportArchive(first, {
      includeSources: true,
      includeArtifacts: false,
    });
    expect(archiveBytes.toString("utf8")).not.toContain("never-export-this");
    expect(archiveBytes.toString("utf8")).not.toContain(
      "credential_ciphertext",
    );
    const archive = portability.parse(archiveBytes);

    const deletion = new WorkspaceDeletionService(runtimePool, {
      ARTIFACT_STORAGE_ROOT: storageRoot,
      PARSER_QUEUE_ROOT: parserRoot,
      JOB_FETCH_QUEUE_ROOT: fetchRoot,
    });
    const requested = await deletion.request(first);
    await expect(
      runtimePool.query(
        "INSERT INTO skills (workspace_id,canonical_name,display_name) VALUES ($1,'blocked','Blocked')",
        [first.workspaceId],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    const receipt = await deletion.process(requested.operationId);
    expect(receipt.state).toBe("succeeded");
    expect(receipt.deletedCounts).toMatchObject({
      job_requirement_sets: 1,
      job_requirements: 1,
    });
    expect(
      receipt.backupExpiresAt.getTime() - receipt.requestedAt.getTime(),
    ).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000);
    expect(
      await runtimePool.query("SELECT 1 FROM workspaces WHERE id=$1", [
        first.workspaceId,
      ]),
    ).toHaveProperty("rowCount", 0);

    const second = await principal("portable-second");
    const preview = await portability.preview(second, archive);
    expect(preview).toMatchObject({ canApply: true, secretFieldCount: 0 });
    await portability.importArchive(second, archive);
    const imported = await runtimePool.query<{ title: string }>(
      "SELECT title FROM career_entries WHERE workspace_id=$1",
      [second.workspaceId],
    );
    expect(imported.rows.map((row) => row.title)).toContain(
      "Synthetic portable project",
    );
    const provider = await runtimePool.query<{
      auth_type: string;
      credential_ciphertext: string | null;
    }>(
      "SELECT auth_type,credential_ciphertext FROM model_provider_configurations WHERE workspace_id=$1",
      [second.workspaceId],
    );
    expect(provider.rows[0]).toEqual({
      auth_type: "none",
      credential_ciphertext: null,
    });
    await expect(
      access(
        path.join(storageRoot, sourceStorageKey(second.workspaceId, sourceId)),
      ),
    ).resolves.toBeUndefined();
  });
});
