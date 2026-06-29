import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  syntheticAuthUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("user creates an entry and explicitly approves grounded evidence", async ({
  page,
}) => {
  const title = `Synthetic E2E project ${Date.now()}`;
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(syntheticAuthUser.email);
  await page.getByLabel("Password").fill(syntheticAuthUser.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page
    .getByRole("link", { name: "Open Career Information Bank" })
    .click();

  await page.getByRole("link", { name: "Add career entry" }).click();
  await page.getByLabel("Entry type").selectOption("project");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("Synthetic browser workflow only");
  await page.getByLabel("Tags").fill("e2e, privacy");
  await page.getByRole("button", { name: "Create entry" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();

  await page
    .getByLabel("Claim or value")
    .first()
    .fill("Built a synthetic privacy control");
  await page.getByRole("button", { name: "Add proposal" }).click();
  await expect(page.getByText(/not verified or eligible/u)).toBeVisible();
  await page.getByRole("button", { name: "Approve fact" }).click();
  await expect(page.getByText(/immutable evidence identifier/u)).toBeVisible();
  await expect(
    page.getByText("Built a synthetic privacy control", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText(/Evidence ID:/u)).toBeVisible();

  await page.getByRole("button", { name: "Archive entry" }).click();
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
});
