import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  signInSyntheticUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("user configures a provider without exposing a credential", async ({
  page,
}) => {
  const marker = Date.now();
  await signInSyntheticUser(page);
  await page.getByRole("link", { name: "Configure model providers" }).click();

  await page.getByLabel("Display name").fill(`Synthetic provider ${marker}`);
  await page.getByLabel("Base URL").fill("https://models.example/v1/");
  await page.getByLabel("Credential mode").selectOption("environment");
  await page
    .getByLabel("Environment variable name (environment mode only)")
    .fill("AI_PROVIDER_SYNTHETIC_KEY");
  await page.getByRole("button", { name: "Save provider" }).click();

  await expect(
    page.getByText(
      "Provider configuration saved. The credential cannot be viewed.",
    ),
  ).toBeVisible();
  const configuredProvider = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: `Synthetic provider ${marker}` }),
  });
  await expect(configuredProvider).toBeVisible();
  await expect(
    configuredProvider.getByText(/Environment.*AI_PROVIDER_SYNTHETIC_KEY/u),
  ).toBeVisible();
  await expect(page.getByLabel("Credential (write-only)")).toHaveValue("");
  await expect(page.locator("body")).not.toContainText("synthetic-secret");

  const cardActionButtons = await Promise.all(
    [
      "Test provider",
      "Assign to selected tasks",
      "Assign to all tasks",
      "Rotate credential",
    ].map(async (name) =>
      configuredProvider.getByRole("button", { name }).boundingBox(),
    ),
  );
  expect(cardActionButtons.every(Boolean)).toBe(true);
  expect(
    new Set(cardActionButtons.map((bounds) => Math.round(bounds!.width))).size,
  ).toBe(1);
  expect(
    new Set(cardActionButtons.map((bounds) => Math.round(bounds!.height))).size,
  ).toBe(1);

  await configuredProvider.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete provider?" });
  await expect(dialog).toContainText(`Synthetic provider ${marker}`);
  await expect(dialog).toContainText("stored credential");
  await dialog.getByRole("button", { name: "Delete provider" }).click();

  await expect(
    page.getByText(
      "Provider configuration and its stored credential were deleted.",
    ),
  ).toBeVisible();
  await expect(configuredProvider).toHaveCount(0);
});
