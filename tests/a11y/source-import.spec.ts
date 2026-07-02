import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  signInSyntheticUser,
  waitForSourceReady,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("source import and untrusted preview meet automated WCAG checks at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await signInSyntheticUser(page);
  await page.goto("/sources");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("region", { name: "Import a document" })
    .getByLabel("Document")
    .setInputFiles({
      name: "a11y-source.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Synthetic source\n\nUnverified text"),
    });
  await page.getByRole("button", { name: "Upload and parse" }).click();
  await waitForSourceReady(page);
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
});
