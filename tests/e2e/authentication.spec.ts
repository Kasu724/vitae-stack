import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  syntheticAuthUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("password user signs in, enters the owned workspace, and signs out", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(syntheticAuthUser.email);
  await page.getByLabel("Password").fill(syntheticAuthUser.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Welcome, ${syntheticAuthUser.name}`,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/u);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sign in" }),
  ).toBeVisible();
});
