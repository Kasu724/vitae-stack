import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  signInSyntheticUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("career bank and entry editor meet automated WCAG A/AA checks at narrow width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await signInSyntheticUser(page);
  await page.goto("/career");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Career Information Bank",
  );
  const bank = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(bank.violations).toEqual([]);
  const bankOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(bankOverflow).toBeLessThanOrEqual(1);

  await page.getByRole("link", { name: "Add career entry" }).click();
  const editor = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(editor.violations).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});
