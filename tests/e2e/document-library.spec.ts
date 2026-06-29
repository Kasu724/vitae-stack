import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  syntheticAuthUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("user saves an autosaved draft, creates a version, compares, and restores copy-forward", async ({
  page,
}) => {
  const title = `Synthetic resume ${Date.now()}`;
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(syntheticAuthUser.email);
  await page.getByLabel("Password").fill(syntheticAuthUser.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await page.getByRole("link", { name: "Open document library" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();

  const summary = page.getByRole("region", { name: "Summary" });
  await summary
    .getByLabel("Text")
    .fill("<script>not executable</script> Synthetic summary");
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved." }),
  ).toBeVisible();
  await expect(
    page.locator("script").filter({ hasText: "not executable" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save immutable version" }).click();
  await expect(
    page.getByText("A new immutable version was saved."),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "manual save" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Compare" }).click();
  await expect(page.getByText(/changed blocks: 1/u)).toBeVisible();
  await page.getByRole("button", { name: "Restore as new version" }).click();
  await expect(
    page.getByText("Historical content was restored as a new version."),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: /^restore/u }),
  ).toBeVisible();
});
