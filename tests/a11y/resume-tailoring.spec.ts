import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  signInSyntheticUser,
  syntheticAuthUser,
} from "../helpers/synthetic-auth";
import { seedSyntheticTailoringRun } from "../helpers/synthetic-tailoring";

let fixture: Awaited<ReturnType<typeof seedSyntheticTailoringRun>>;
const tailoringUser = {
  ...syntheticAuthUser,
  email: `a11y-tailoring-${Date.now()}@example.test`,
};

test.beforeAll(async () => {
  await ensureSyntheticAuthUser(tailoringUser);
  fixture = await seedSyntheticTailoringRun({ email: tailoringUser.email });
});

test("resume suggestion review meets automated WCAG checks at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await signInSyntheticUser(page, tailoringUser);
  await page.goto(`/tailoring/runs/${fixture.runId}`);
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
  await page.goto(`/tailoring/runs/${fixture.coverLetterRunId}`);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.goto(`/ats/reports/${fixture.atsReportId}`);
  await expect(page.locator("table")).toBeHidden();
  await expect(page.getByText(/Earned \/ applicable:/u).first()).toBeVisible();
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
  await page.goto(`/exports?documentId=${fixture.documentId}`);
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
