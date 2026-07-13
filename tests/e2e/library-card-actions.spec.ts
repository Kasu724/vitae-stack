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
    "Are you sure you want to archive the following entries:",
  );
  await expect(archiveDialog).toContainText(titles[0]!);
  await expect(archiveDialog).toContainText(titles[1]!);
  await archiveDialog
    .getByRole("button", { name: "Archive 2 entries" })
    .click();
  await expect(page.getByText("Selected entries were archived.")).toBeVisible();

  await page.getByLabel(`Select ${titles[2]}`).check();
  await page.getByLabel(`Select ${titles[3]}`).check();
  await page.getByRole("button", { name: "Delete selected" }).click();
  const deleteDialog = page.getByRole("dialog");
  await expect(deleteDialog).toContainText(
    "Are you sure you want to delete the following entries:",
  );
  await expect(deleteDialog).toContainText(titles[2]!);
  await expect(deleteDialog).toContainText(titles[3]!);
  await deleteDialog.getByRole("button", { name: "Delete 2 entries" }).click();
  await expect(
    page.getByText(
      "The selected entries and the dependencies shown in their previews were deleted.",
    ),
  ).toBeVisible();

  await page.goto("/career?status=archived");
  await page.getByRole("button", { name: `Restore ${titles[0]}` }).click();
  const restoreDialog = page.getByRole("dialog");
  await expect(restoreDialog).toContainText(
    "Are you sure you want to restore the following entry:",
  );
  await restoreDialog.getByRole("button", { name: "Restore 1 entry" }).click();
  await expect(page.getByText("Selected entries were restored.")).toBeVisible();
});
