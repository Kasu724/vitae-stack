import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  syntheticAuthUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("user configures a provider without exposing a credential", async ({
  page,
}) => {
  const marker = Date.now();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(syntheticAuthUser.email);
  await page.getByLabel("Password").fill(syntheticAuthUser.password);
  await page.getByRole("button", { name: "Sign in" }).click();
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
  await expect(page.getByText(`Synthetic provider ${marker}`)).toBeVisible();
  await expect(
    page.getByText("Environment reference AI_PROVIDER_SYNTHETIC_KEY"),
  ).toBeVisible();
  await expect(page.getByLabel("Credential (write-only)")).toHaveValue("");
  await expect(page.locator("body")).not.toContainText("synthetic-secret");
});
