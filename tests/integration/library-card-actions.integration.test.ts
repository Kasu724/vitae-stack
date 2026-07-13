// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Pool } from "@/infrastructure/database/sqlite-pool";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import {
  CareerNotFoundError,
  CareerRepository,
} from "@/modules/career/repository";
import {
  DocumentNotFoundError,
  DocumentRepository,
} from "@/modules/documents/repository";
import { SourceRepository } from "@/modules/ingestion/source-repository";
import { JobNotFoundError, JobRepository } from "@/modules/jobs/repository";

import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../helpers/sqlite-test-database";

let database: SqliteTestDatabase;
let pool: Pool;
let first: WorkspacePrincipal;
let second: WorkspacePrincipal;

async function principal(label: string): Promise<WorkspacePrincipal> {
  const user = await pool.query<{ id: string }>(
    "INSERT INTO users (email,name) VALUES ($1,$2) RETURNING id",
    [`${label}@example.test`, label],
  );
  const workspace = await pool.query<{ id: string }>(
    "INSERT INTO workspaces (owner_user_id,name) VALUES ($1,$2) RETURNING id",
    [user.rows[0]!.id, `${label} workspace`],
  );
  await pool.query(
    "INSERT INTO workspace_memberships (workspace_id,user_id) VALUES ($1,$2)",
    [workspace.rows[0]!.id, user.rows[0]!.id],
  );
  await pool.query(
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
  database = await createSqliteTestDatabase("library-card-actions");
  pool = database.pool;
  first = await principal("library-first");
  second = await principal("library-second");
}, 120_000);

afterAll(async () => {
  await database?.cleanup();
});

describe("bulk library repository actions", () => {
  it("archives complete authorized selections and rolls back mixed-workspace selections", async () => {
    const documents = new DocumentRepository(pool);
    const firstDocuments = await Promise.all([
      documents.create(first, { kind: "resume", title: "First resume" }),
      documents.create(first, { kind: "cover_letter", title: "First letter" }),
    ]);
    const foreignDocument = await documents.create(second, {
      kind: "resume",
      title: "Foreign resume",
    });
    await documents.setArchivedMany(first, firstDocuments, true);
    expect(
      (await documents.list(first, "archived")).map(({ id }) => id),
    ).toEqual(expect.arrayContaining(firstDocuments));
    await expect(
      documents.setArchivedMany(
        first,
        [firstDocuments[0]!, foreignDocument],
        false,
      ),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(
      (await documents.list(first, "archived")).map(({ id }) => id),
    ).toContain(firstDocuments[0]);

    const jobs = new JobRepository(pool);
    const firstJobs = await Promise.all([
      jobs.createFromText(first, {
        title: "First role",
        company: "Example",
        text: "Build private local systems.",
      }),
      jobs.createFromText(first, {
        title: "Second role",
        company: "Example",
        text: "Review evidence controls.",
      }),
    ]);
    const foreignJob = await jobs.createFromText(second, {
      title: "Foreign role",
      company: "Other",
      text: "This belongs to another workspace.",
    });
    await jobs.setArchivedMany(first, firstJobs, true);
    await expect(
      jobs.setArchivedMany(first, [firstJobs[0]!, foreignJob], false),
    ).rejects.toBeInstanceOf(JobNotFoundError);
    expect((await jobs.list(first, "archived")).map(({ id }) => id)).toContain(
      firstJobs[0],
    );

    const career = new CareerRepository(pool);
    const createEntry = (owner: WorkspacePrincipal, title: string) =>
      career.createEntry(owner, {
        type: "project",
        title,
        organization: null,
        location: null,
        description: null,
        startDate: undefined,
        endDate: undefined,
        isCurrent: false,
        tags: [],
      });
    const firstEntries = await Promise.all([
      createEntry(first, "First project"),
      createEntry(first, "Second project"),
    ]);
    const foreignEntry = await createEntry(second, "Foreign project");
    await career.setArchivedMany(first, firstEntries, true);
    await expect(
      career.setArchivedMany(first, [firstEntries[0]!, foreignEntry], false),
    ).rejects.toBeInstanceOf(CareerNotFoundError);
    expect(
      (await career.listEntries(first, { status: "archived" })).map(
        ({ id }) => id,
      ),
    ).toContain(firstEntries[0]);
  });

  it("preflights the complete source deletion selection in one workspace", async () => {
    const sources = new SourceRepository(pool);
    const firstSource = crypto.randomUUID();
    const secondFirstSource = crypto.randomUUID();
    const foreignSource = crypto.randomUUID();
    for (const [owner, id, name] of [
      [first, firstSource, "first.txt"],
      [first, secondFirstSource, "second-first.txt"],
      [second, foreignSource, "foreign.txt"],
    ] as const)
      await pool.query(
        `INSERT INTO source_documents (id,workspace_id,uploaded_by_user_id,purpose,original_name,declared_media_type,detected_media_type,byte_size,content_hash,storage_key,status)
         VALUES ($1,$2,$3,'career_evidence',$4,'text/plain','text/plain',1,$5,$6,'ready')`,
        [
          id,
          owner.workspaceId,
          owner.userId,
          name,
          `sha256:${"a".repeat(64)}`,
          `${owner.workspaceId}/${id}.bin`,
        ],
      );
    const removed: string[] = [];
    await sources.deleteManyWithArtifacts(first, [firstSource], async (id) => {
      removed.push(id);
    });
    await expect(
      sources.deleteManyWithArtifacts(
        first,
        [secondFirstSource, foreignSource],
        async (id) => {
          removed.push(id);
        },
      ),
    ).rejects.toThrow("unavailable");
    expect(removed).toEqual([firstSource]);
    expect((await sources.list(first)).map(({ id }) => id)).toContain(
      secondFirstSource,
    );
  });
});
