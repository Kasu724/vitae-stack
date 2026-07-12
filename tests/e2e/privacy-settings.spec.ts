import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  signInSyntheticUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("user exports data and receives an import dry-run before writes", async ({
  page,
}) => {
  await signInSyntheticUser(page);
  await page.goto("/settings/privacy");
  await expect(
    page.getByRole("heading", { name: "Privacy and data controls" }),
  ).toBeVisible();
  await expect(page.getByText("Project telemetry is disabled.")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Create archive" }).click();
  const download = await downloadPromise;
  const archivePath = await download.path();
  expect(archivePath).not.toBeNull();
  await page.getByLabel("Vitae Stack JSON archive").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/json",
    buffer: await readFile(archivePath!),
  });
  await page.getByRole("button", { name: "Run dry check" }).click();
  await expect(
    page.getByRole("heading", { name: "Dry-run result" }),
  ).toBeFocused();
  await expect(page.getByRole("status")).toContainText("Dry run");
});

test("deletion confirmation errors expose the server error code", async ({
  page,
}) => {
  await signInSyntheticUser(page);
  await page.goto("/settings/privacy");
  await page.getByLabel("Type DELETE MY WORKSPACE").fill("not confirmed");
  await page
    .getByRole("button", { name: "Permanently delete workspace" })
    .click();

  await expect(page.getByRole("status")).toContainText("CONFIRMATION_REQUIRED");
  await expect(page.getByRole("status")).toContainText(
    "Do not assume active data was erased",
  );
});
