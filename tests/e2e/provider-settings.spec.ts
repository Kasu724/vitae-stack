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
    configuredProvider.getByText(
      "Environment reference AI_PROVIDER_SYNTHETIC_KEY",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Credential (write-only)")).toHaveValue("");
  await expect(page.locator("body")).not.toContainText("synthetic-secret");
});
