import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  signInSyntheticUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("privacy controls meet automated WCAG checks at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await signInSyntheticUser(page);
  await page.goto("/settings/privacy");
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
