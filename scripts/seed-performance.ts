import { createHash } from "node:crypto";

import { createDatabaseConnection } from "../src/infrastructure/database/connection";
import { createInitialDocument } from "../src/modules/documents/document-schema";
import { contentHash } from "../src/modules/documents/hash";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Performance seeding is disabled when NODE_ENV=production.");
}
if (!process.argv.includes("--confirm-synthetic-scale")) {
  throw new Error(
    "Refusing to create the reference-size fixture without --confirm-synthetic-scale.",
  );
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const email = argument("email") ?? "trusted-local@vitae.invalid";

const connection = createDatabaseConnection(databaseUrl, { maxConnections: 1 });
const client = await connection.pool.connect();
try {
  const identity = await client.query<{
    user_id: string;
    workspace_id: string;
    profile_id: string;
  }>(
    `SELECT u.id AS user_id,m.workspace_id,p.id AS profile_id
     FROM users u
     JOIN workspace_memberships m ON m.user_id=u.id AND m.role='owner'
     JOIN career_profiles p ON p.workspace_id=m.workspace_id
     WHERE lower(u.email)=lower($1)
     ORDER BY m.created_at
     LIMIT 1`,
    [email],
  );
  const owner = identity.rows[0];
  if (!owner) throw new Error(`No owner account exists for ${email}.`);

  const existing = await client.query(
    `SELECT 1 FROM career_entries
     WHERE workspace_id=$1 AND title='Synthetic performance entry 0001'
     LIMIT 1`,
    [owner.workspace_id],
  );
  if (existing.rowCount) {
    console.log(
      "Synthetic performance fixture already exists; no changes made.",
    );
  } else {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `synthetic-performance-seed:${owner.workspace_id}`,
    ]);
    await client.query(
      `WITH inserted AS (
         INSERT INTO career_entries
           (workspace_id,career_profile_id,type,title,description,tags)
         SELECT $1,$2,'project',
                'Synthetic performance entry ' || lpad(series::text,4,'0'),
                'Fictional reference-size performance fixture only.',
                ARRAY['synthetic','performance-fixture']::text[]
         FROM generate_series(1,1000) AS series
         RETURNING id,title
       )
       INSERT INTO evidence_facts
         (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id)
       SELECT $1,id,'statement',
              jsonb_build_object('kind','text','text','Completed ' || title || ' with bounded evidence.'),
              'Completed ' || title || ' with bounded evidence.',
              jsonb_build_object('kind','manual','label','Synthetic reference-size fixture'),
              $3
       FROM inserted`,
      [owner.workspace_id, owner.profile_id, owner.user_id],
    );

    for (let documentNumber = 1; documentNumber <= 100; documentNumber += 1) {
      const document = await client.query<{ id: string }>(
        `INSERT INTO documents
           (workspace_id,career_profile_id,kind,title,revision)
         VALUES ($1,$2,'resume',$3,20)
         RETURNING id`,
        [
          owner.workspace_id,
          owner.profile_id,
          `Synthetic performance resume ${String(documentNumber).padStart(3, "0")}`,
        ],
      );
      const documentId = document.rows[0]!.id;
      const canonical = createInitialDocument("resume");
      let parentVersionId: string | null = null;
      for (let revision = 1; revision <= 20; revision += 1) {
        canonical.sections.find(
          (section) => section.type === "summary",
        )!.blocks[0]!.text =
          `Synthetic reference document ${documentNumber}, immutable revision ${revision}.`;
        const insertedVersionId: string = (
          await client.query<{ id: string }>(
            `INSERT INTO document_versions
             (workspace_id,document_id,parent_version_id,author_user_id,reason,content,content_hash,created_at)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,now() + ($8 * interval '1 millisecond'))
           RETURNING id`,
            [
              owner.workspace_id,
              documentId,
              parentVersionId,
              owner.user_id,
              revision === 1 ? "initial" : "manual_save",
              JSON.stringify(canonical),
              contentHash(canonical),
              revision,
            ],
          )
        ).rows[0]!.id;
        parentVersionId = insertedVersionId;
        for (const [position, section] of canonical.sections.entries()) {
          await client.query(
            `INSERT INTO document_sections
               (workspace_id,version_id,stable_section_id,section_type,heading,position,content_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              owner.workspace_id,
              parentVersionId,
              section.id,
              section.type,
              section.heading ?? null,
              position,
              contentHash(section),
            ],
          );
        }
      }
      await client.query(
        "UPDATE documents SET current_version_id=$3 WHERE id=$1 AND workspace_id=$2",
        [documentId, owner.workspace_id, parentVersionId],
      );
    }

    for (let jobNumber = 1; jobNumber <= 50; jobNumber += 1) {
      const text = `Synthetic role ${jobNumber}. Required: TypeScript, evidence controls, accessible interfaces, and reliable batch processing.`;
      const posting = await client.query<{ id: string }>(
        `INSERT INTO job_postings (workspace_id,title,company)
         VALUES ($1,$2,'Synthetic Performance Employer') RETURNING id`,
        [
          owner.workspace_id,
          `Synthetic performance job ${String(jobNumber).padStart(2, "0")}`,
        ],
      );
      await client.query(
        `INSERT INTO job_posting_revisions
           (workspace_id,job_posting_id,input_method,revision_number,normalized_text,content_hash,metadata,created_by_user_id)
         VALUES ($1,$2,'text',1,$3,$4,$5::jsonb,$6)`,
        [
          owner.workspace_id,
          posting.rows[0]!.id,
          text,
          `sha256:${createHash("sha256").update(text).digest("hex")}`,
          JSON.stringify({
            schemaVersion: 1,
            warnings: ["Synthetic reference-size fixture"],
          }),
          owner.user_id,
        ],
      );
    }

    await client.query(
      `INSERT INTO audit_events
         (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata)
       VALUES ($1,$2,'dev.seed.performance','workspace',$1,'succeeded',$3,$4::jsonb)`,
      [
        owner.workspace_id,
        owner.user_id,
        crypto.randomUUID(),
        JSON.stringify({
          documents: 100,
          facts: 1000,
          jobs: 50,
          versionsPerDocument: 20,
          syntheticOnly: true,
        }),
      ],
    );
    await client.query("COMMIT");
    console.log(
      "Created the synthetic reference fixture: 1,000 facts, 100 documents x 20 versions, and 50 jobs.",
    );
  }
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The original failure remains authoritative if no transaction was active.
  }
  throw error;
} finally {
  client.release();
  await connection.pool.end();
}
