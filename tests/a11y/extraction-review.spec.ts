import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  syntheticAuthUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("extraction review meets automated WCAG checks and reflows at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(syntheticAuthUser.email);
  await page.getByLabel("Password").fill(syntheticAuthUser.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto("/sources");
  await page.getByLabel("Document").setInputFiles({
    name: "a11y-extraction.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic accessible claim\nUnverified second claim"),
  });
  await page.getByRole("button", { name: "Upload and parse" }).click();
  await page.getByRole("button", { name: "Review extracted facts" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Review extracted facts" }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});
