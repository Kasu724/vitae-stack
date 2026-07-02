import { createDatabaseConnection } from "../src/infrastructure/database/connection";
import type { WorkspacePrincipal } from "../src/modules/auth/workspace-access";
import { CareerRepository } from "../src/modules/career/repository";
import { DocumentRepository } from "../src/modules/documents/repository";
import { JobRepository } from "../src/modules/jobs/repository";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Synthetic seeding is disabled when NODE_ENV=production.");
}
if (!process.argv.includes("--confirm-synthetic")) {
  throw new Error(
    "Refusing to write data without --confirm-synthetic. The command only adds clearly labeled fictional records.",
  );
}

const email = argument("email") ?? "trusted-local@vitae.invalid";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const connection = createDatabaseConnection(databaseUrl, { maxConnections: 2 });
try {
  const identity = await connection.pool.query<{
    user_id: string;
    workspace_id: string;
  }>(
    `SELECT u.id AS user_id,m.workspace_id
     FROM users u
     JOIN workspace_memberships m ON m.user_id=u.id AND m.role='owner'
     WHERE lower(u.email)=lower($1)
     ORDER BY m.created_at
     LIMIT 1`,
    [email],
  );
  const owner = identity.rows[0];
  if (!owner) {
    throw new Error(
      `No owner account exists for ${email}. Start trusted-local mode once or bootstrap a password account first.`,
    );
  }

  const alreadySeeded = await connection.pool.query(
    `SELECT 1 FROM career_entries
     WHERE workspace_id=$1 AND title='Synthetic Platform Engineer (example data)'
     LIMIT 1`,
    [owner.workspace_id],
  );
  if (alreadySeeded.rowCount) {
    console.log("Synthetic example data already exists; no changes made.");
    process.exitCode = 0;
  } else {
    const principal: WorkspacePrincipal = {
      authenticatedAt: new Date(),
      mode:
        email === "trusted-local@vitae.invalid" ? "trusted-local" : "password",
      userId: owner.user_id,
      workspaceId: owner.workspace_id,
    };
    const career = new CareerRepository(connection.pool);
    const documents = new DocumentRepository(connection.pool);
    const jobs = new JobRepository(connection.pool);

    await career.getProfileSettings(principal);
    await career.updateProfileSettings(principal, {
      careerGoals: ["Build reliable, privacy-preserving software"],
      targetRoles: ["Staff Software Engineer", "Product Engineer"],
      tone: "direct",
    });

    const examples = [
      {
        type: "work" as const,
        title: "Synthetic Platform Engineer (example data)",
        organization: "Example Cooperative",
        description: "Fictional work record for local evaluation only.",
        startDate: "2022-01",
        endDate: "2025-03",
        fact: "Reduced a synthetic batch workflow from 40 minutes to 12 minutes.",
        factType: "metric" as const,
        value: {
          kind: "metric" as const,
          value: 70,
          unit: "percent reduction",
          context: "Synthetic batch workflow duration",
        },
      },
      {
        type: "project" as const,
        title: "Synthetic Evidence Ledger",
        organization: null,
        description: "Fictional open-source project example.",
        startDate: "2024",
        endDate: "2025",
        fact: "Built an evidence ledger with immutable claim identifiers.",
        factType: "statement" as const,
        value: {
          kind: "text" as const,
          text: "Built an evidence ledger with immutable claim identifiers.",
        },
      },
      {
        type: "education" as const,
        title: "B.S. Computer Science (synthetic)",
        organization: "Example State University",
        description: "Fictional education example.",
        startDate: "2018",
        endDate: "2022",
        fact: "Completed a synthetic Bachelor of Science in Computer Science.",
        factType: "education" as const,
        value: {
          kind: "text" as const,
          text: "Completed a synthetic Bachelor of Science in Computer Science.",
        },
      },
      {
        type: "award" as const,
        title: "Synthetic Community Award",
        organization: "Example Foundation",
        description: "Fictional award example.",
        startDate: "2023",
        endDate: "",
        fact: "Received a synthetic award for accessible documentation.",
        factType: "accomplishment" as const,
        value: {
          kind: "text" as const,
          text: "Received a synthetic award for accessible documentation.",
        },
      },
    ];

    const created: Array<{ entryId: string; factId: string }> = [];
    for (const example of examples) {
      const entryId = await career.createEntry(principal, {
        type: example.type,
        title: example.title,
        organization: example.organization,
        location: null,
        description: example.description,
        startDate: example.startDate,
        endDate: example.endDate,
        isCurrent: false,
        tags: ["synthetic", "example-data"],
      });
      const proposalId = await career.createProposal(principal, entryId, {
        type: example.factType,
        value: example.value,
        displayText: example.fact,
        sourceLocator: {
          kind: "manual",
          label: "Synthetic seed fixture; not a real career claim",
        },
      });
      created.push({
        entryId,
        factId: await career.approveProposal(principal, proposalId),
      });
    }

    const skillId = await career.createSkill(principal, {
      displayName: "TypeScript",
      category: "Programming language",
      aliases: ["TS"],
    });
    await career.linkSkill(principal, created[0]!.entryId, skillId, "advanced");
    await career.linkSkill(principal, created[1]!.entryId, skillId, "advanced");

    const resumeId = await documents.create(principal, {
      kind: "resume",
      title: "Synthetic evidence-grounded resume",
    });
    const resume = await documents.get(principal, resumeId);
    const resumeContent = structuredClone(resume.currentVersion.content);
    resumeContent.sections.find(
      (section) => section.type === "contact",
    )!.blocks[0]!.text = "Synthetic Candidate | candidate@example.test";
    resumeContent.sections.find(
      (section) => section.type === "experience",
    )!.blocks[0]!.text = examples[0]!.fact;
    await documents.commitVersion(principal, {
      documentId: resumeId,
      baseVersionId: resume.currentVersion.id,
      content: resumeContent,
      idempotencyKey: "synthetic-seed-resume-v1",
    });
    const resumeClaims = await documents.listClaims(principal, resumeId);
    const experienceClaim = resumeClaims.find(
      (claim) => claim.text === examples[0]!.fact,
    );
    if (experienceClaim) {
      await documents.supportClaimWithEvidence(principal, {
        documentId: resumeId,
        claimId: experienceClaim.id,
        evidenceFactId: created[0]!.factId,
      });
    }

    const letterId = await documents.create(principal, {
      kind: "cover_letter",
      title: "Synthetic evidence-grounded cover letter",
    });
    const letter = await documents.get(principal, letterId);
    const letterContent = structuredClone(letter.currentVersion.content);
    letterContent.sections.find(
      (section) => section.type === "body",
    )!.blocks[0]!.text = examples[1]!.fact;
    await documents.commitVersion(principal, {
      documentId: letterId,
      baseVersionId: letter.currentVersion.id,
      content: letterContent,
      idempotencyKey: "synthetic-seed-letter-v1",
    });
    const letterClaims = await documents.listClaims(principal, letterId);
    const bodyClaim = letterClaims.find(
      (claim) => claim.text === examples[1]!.fact,
    );
    if (bodyClaim) {
      await documents.supportClaimWithEvidence(principal, {
        documentId: letterId,
        claimId: bodyClaim.id,
        evidenceFactId: created[1]!.factId,
      });
    }

    await jobs.createFromText(principal, {
      title: "Synthetic Staff Product Engineer",
      company: "Example Hiring Company",
      text: [
        "Required: build reliable TypeScript systems.",
        "Improve batch processing performance.",
        "Document evidence and accessibility decisions.",
      ].join("\n"),
      idempotencyKey: "synthetic-seed-job-v1",
    });

    await connection.pool.query(
      `INSERT INTO audit_events
         (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata)
       VALUES ($1,$2,'dev.seed.synthetic','workspace',$1,'succeeded',$3,$4::jsonb)`,
      [
        principal.workspaceId,
        principal.userId,
        crypto.randomUUID(),
        JSON.stringify({ entries: examples.length, syntheticOnly: true }),
      ],
    );
    console.log(
      "Created synthetic entries, approved evidence, linked skills, grounded documents, and a job snapshot.",
    );
  }
} finally {
  await connection.pool.end();
}
