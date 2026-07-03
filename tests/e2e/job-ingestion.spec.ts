import { expect, test } from "@playwright/test";

import { createDatabaseConnection } from "@/infrastructure/database/connection";

import {
  ensureSyntheticAuthUser,
  signInSyntheticUser,
  syntheticAuthUser,
  waitForSourceReady,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("user saves pasted and file-based immutable job snapshots", async ({
  page,
}) => {
  const marker = Date.now();
  const connection = createDatabaseConnection(
    process.env.DATABASE_PATH ?? "./var/vitae.sqlite",
  );
  try {
    const context = await connection.pool.query<{
      user_id: string;
      workspace_id: string;
      profile_id: string;
    }>(
      `SELECT u.id user_id,w.id workspace_id,p.id profile_id FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id JOIN career_profiles p ON p.workspace_id=w.id WHERE u.email=$1 LIMIT 1`,
      [syntheticAuthUser.email],
    );
    const fixture = context.rows[0]!;
    const entry = await connection.pool.query<{ id: string }>(
      `INSERT INTO career_entries (workspace_id,career_profile_id,type,title,description) VALUES ($1,$2,'project',$3,'Synthetic E2E matching fixture') RETURNING id`,
      [fixture.workspace_id, fixture.profile_id, `Matching fixture ${marker}`],
    );
    await connection.pool.query(
      `INSERT INTO evidence_facts (workspace_id,career_entry_id,type,value,display_text,source_locator,approved_by_user_id) VALUES ($1,$2,'statement',$3::jsonb,'Build corrected synthetic systems',$4::jsonb,$5)`,
      [
        fixture.workspace_id,
        entry.rows[0]!.id,
        JSON.stringify({
          kind: "text",
          text: "Build corrected synthetic systems",
        }),
        JSON.stringify({ kind: "manual", label: "Synthetic E2E fixture" }),
        fixture.user_id,
      ],
    );
  } finally {
    await connection.pool.end();
  }
  await signInSyntheticUser(page);
  await page.getByRole("link", { name: "Add a job description" }).click();

  await page.getByLabel("Role title").first().fill(`Synthetic role ${marker}`);
  await page.getByLabel("Company").first().fill("Example Company");
  await page
    .getByLabel("Job description")
    .fill("Build synthetic systems\r\nReview evidence controls");
  await page.getByRole("button", { name: "Save job snapshot" }).click();
  await expect(
    page.getByText("The pasted job snapshot was saved."),
  ).toBeVisible();
  await expect(
    page.getByText("Revision 1", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByLabel("Corrected job description")
    .fill("Build corrected synthetic systems");
  await page.getByRole("button", { name: "Create corrected revision" }).click();
  await expect(
    page.getByText("Revision 2", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Revision 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Analyze without AI" }).click();
  await expect(
    page.getByText("A requirement draft was created for review."),
  ).toBeVisible();
  await page.getByLabel("Decision").selectOption("accepted");
  await page.getByRole("button", { name: "Save review decision" }).click();
  await page
    .getByRole("button", { name: "Finalize reviewed requirements" })
    .click();
  await expect(
    page.getByText(
      "The reviewed requirements were saved as an immutable revision.",
    ),
  ).toBeVisible();
  await expect(
    page
      .getByLabel("Current normalized snapshot")
      .getByText("Build corrected synthetic systems", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate candidates" }).click();
  await expect(
    page.getByText(
      "Deterministic evidence candidates and explicit gaps were generated.",
    ),
  ).toBeVisible();
  await expect(page.getByText(/lexical-evidence@1/u)).toBeVisible();
  await page
    .getByRole("button", { name: "Include", exact: true })
    .first()
    .click();
  await expect(page.getByText("User decision: included").first()).toBeVisible();

  await page.goto("/jobs");
  await page.getByLabel("Job-description file").setInputFiles({
    name: "synthetic-job.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      `# Synthetic file role ${marker}\n\nEmployer requirement`,
    ),
  });
  await page.getByRole("button", { name: "Upload and review file" }).click();
  await waitForSourceReady(page);
  await expect(
    page.getByText(/does not treat job claims as your career evidence/u),
  ).toBeVisible();
  await page.getByLabel("Role title").fill(`Synthetic file role ${marker}`);
  await page.getByRole("button", { name: "Save job snapshot" }).click();
  await expect(
    page.getByText(
      "The reviewed file text was saved as an immutable job snapshot.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Input: file", { exact: false })).toBeVisible();

  await page.goto("/jobs");
  const urlSection = page
    .getByRole("heading", { name: "Public HTTPS URL" })
    .locator("..");
  await urlSection.getByLabel("Role title").fill("Blocked synthetic URL role");
  await urlSection.getByLabel("Job URL").fill("http://127.0.0.1/private");
  await urlSection
    .getByRole("button", { name: "Fetch public job page" })
    .click();
  await expect(
    page.getByText(/cannot be fetched under the public HTTPS policy/u),
  ).toBeVisible();
});
