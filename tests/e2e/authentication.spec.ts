import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  signInSyntheticUser,
  syntheticAuthUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("password user signs in, enters the owned workspace, and signs out", async ({
  page,
}) => {
  await signInSyntheticUser(page);

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
