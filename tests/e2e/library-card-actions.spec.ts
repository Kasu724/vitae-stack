import { expect, test } from "@playwright/test";

import { createDatabaseConnection } from "@/infrastructure/database/connection";

import {
  ensureSyntheticAuthUser,
  signInSyntheticUser,
  syntheticAuthUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("library status tabs switch every card collection", async ({ page }) => {
  await signInSyntheticUser(page);

  for (const collection of [
    {
      path: "/career?q=synthetic",
      label: "Career entry status",
      archivedUrl: /\/career\?q=synthetic&status=archived$/u,
      activeUrl: /\/career\?q=synthetic$/u,
    },
    {
      path: "/documents",
      label: "Document library status",
      archivedUrl: /\/documents\?status=archived$/u,
      activeUrl: /\/documents$/u,
    },
    {
      path: "/jobs",
      label: "Saved job status",
      archivedUrl: /\/jobs\?status=archived$/u,
      activeUrl: /\/jobs$/u,
    },
  ]) {
    await page.goto(collection.path);
    const tabs = page.getByRole("navigation", { name: collection.label });
    await expect(tabs.getByRole("link", { name: "Active" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await tabs.getByRole("link", { name: "Archived" }).click();
    await expect(page).toHaveURL(collection.archivedUrl);
    await expect(
      page
        .getByRole("navigation", { name: collection.label })
        .getByRole("link", { name: "Archived" }),
    ).toHaveAttribute("aria-current", "page");

    await page
      .getByRole("navigation", { name: collection.label })
      .getByRole("link", { name: "Active" })
      .click();
    await expect(page).toHaveURL(collection.activeUrl);
  }
});

test("card icons and multi-select actions confirm named career entries", async ({
  page,
}) => {
  const marker = Date.now();
  const titles = [
    `Archive first ${marker}`,
    `Archive second ${marker}`,
    `Delete first ${marker}`,
    `Delete second ${marker}`,
  ];
  const connection = createDatabaseConnection(
    process.env.DATABASE_PATH ?? "./var/vitae.sqlite",
  );
  try {
    const context = await connection.pool.query<{
      workspace_id: string;
      profile_id: string;
    }>(
      `SELECT w.id workspace_id,p.id profile_id FROM users u
       JOIN workspace_memberships m ON m.user_id=u.id
       JOIN workspaces w ON w.id=m.workspace_id
       JOIN career_profiles p ON p.workspace_id=w.id
       WHERE u.email=$1 LIMIT 1`,
      [syntheticAuthUser.email],
    );
    const fixture = context.rows[0]!;
    for (const title of titles)
      await connection.pool.query(
        `INSERT INTO career_entries (workspace_id,career_profile_id,type,title,description)
         VALUES ($1,$2,'project',$3,'Synthetic card-action fixture')`,
        [fixture.workspace_id, fixture.profile_id, title],
      );
  } finally {
    await connection.pool.end();
  }

  await signInSyntheticUser(page);
  await page.goto("/career");

  await page.getByLabel(`Select ${titles[0]}`).check();
  await page.getByLabel(`Select ${titles[1]}`).check();
  await expect(
    page.getByRole("status").filter({ hasText: "2 selected" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Archive selected" }).click();
  const archiveDialog = page.getByRole("dialog");
  await expect(archiveDialog).toContainText(
    "Are you sure you want to archive the following items:",
  );
  await expect(archiveDialog).toContainText(titles[0]!);
  await expect(archiveDialog).toContainText(titles[1]!);
  await archiveDialog.getByRole("button", { name: "Archive 2 items" }).click();
  await expect(page.getByText("Selected entries were archived.")).toBeVisible();

  await page.getByLabel(`Select ${titles[2]}`).check();
  await page.getByLabel(`Select ${titles[3]}`).check();
  await page.getByRole("button", { name: "Delete selected" }).click();
  const deleteDialog = page.getByRole("dialog");
  await expect(deleteDialog).toContainText(
    "Are you sure you want to delete the following items:",
  );
  await expect(deleteDialog).toContainText(titles[2]!);
  await expect(deleteDialog).toContainText(titles[3]!);
  await deleteDialog.getByRole("button", { name: "Delete 2 items" }).click();
  await expect(
    page.getByText(
      "The selected entries and the dependencies shown in their previews were deleted.",
    ),
  ).toBeVisible();

  await page.goto("/career?status=archived");
  await page.getByRole("button", { name: `Restore ${titles[0]}` }).click();
  const restoreDialog = page.getByRole("dialog");
  await expect(restoreDialog).toContainText(
    "Are you sure you want to restore the following item:",
  );
  await restoreDialog.getByRole("button", { name: "Restore 1 item" }).click();
  await expect(page.getByText("Selected entries were restored.")).toBeVisible();
});

test("job cards preview and delete complete named selections", async ({
  page,
}) => {
  const marker = Date.now();
  const titles = [`Delete job first ${marker}`, `Delete job second ${marker}`];
  const connection = createDatabaseConnection(
    process.env.DATABASE_PATH ?? "./var/vitae.sqlite",
  );
  try {
    const context = await connection.pool.query<{
      workspace_id: string;
      user_id: string;
    }>(
      `SELECT w.id workspace_id,u.id user_id FROM users u
       JOIN workspace_memberships m ON m.user_id=u.id
       JOIN workspaces w ON w.id=m.workspace_id
       WHERE u.email=$1 LIMIT 1`,
      [syntheticAuthUser.email],
    );
    const fixture = context.rows[0]!;
    for (const [index, title] of titles.entries()) {
      const posting = await connection.pool.query<{ id: string }>(
        `INSERT INTO job_postings (workspace_id,title,company)
         VALUES ($1,$2,'Synthetic Company') RETURNING id`,
        [fixture.workspace_id, title],
      );
      await connection.pool.query(
        `INSERT INTO job_posting_revisions
           (workspace_id,job_posting_id,input_method,revision_number,normalized_text,content_hash,metadata,created_by_user_id)
         VALUES ($1,$2,'text',1,$3,$4,'{}',$5)`,
        [
          fixture.workspace_id,
          posting.rows[0]!.id,
          `Synthetic disposable job ${index + 1}`,
          `sha256:${String(index + 1).repeat(64)}`,
          fixture.user_id,
        ],
      );
    }
  } finally {
    await connection.pool.end();
  }

  await signInSyntheticUser(page);
  await page.goto("/jobs");
  await page.getByLabel(`Select ${titles[0]}`).check();
  await page.getByLabel(`Select ${titles[1]}`).check();
  await page.getByRole("button", { name: "Delete selected" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "Are you sure you want to delete the following jobs:",
  );
  await expect(dialog).toContainText(titles[0]!);
  await expect(dialog).toContainText(titles[1]!);
  await expect(dialog).toContainText(
    "No accepted document versions block permanent deletion.",
  );
  await dialog.getByRole("button", { name: "Delete 2 jobs" }).click();
  await expect(
    page.getByText(
      "The selected jobs and the deletable analysis shown in their previews were deleted.",
    ),
  ).toBeVisible();
});
