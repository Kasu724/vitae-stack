import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("foundation page has no detectable WCAG A/AA violations", async ({
  page,
}) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
