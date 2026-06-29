import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  syntheticAuthUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("sign-in and authenticated workspace have no detectable WCAG A/AA violations", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const signIn = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(signIn.violations).toEqual([]);

  await page.getByLabel("Email").fill(syntheticAuthUser.email);
  await page.getByLabel("Password").fill(syntheticAuthUser.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);

  const dashboard = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(dashboard.violations).toEqual([]);
});
