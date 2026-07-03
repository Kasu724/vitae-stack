import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  signInSyntheticUser,
  syntheticAuthUser,
} from "../helpers/synthetic-auth";
import { seedSyntheticTailoringRun } from "../helpers/synthetic-tailoring";

let fixture: Awaited<ReturnType<typeof seedSyntheticTailoringRun>>;

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
  fixture = await seedSyntheticTailoringRun({ email: syntheticAuthUser.email });
});

test("user inspects a resume suggestion and its exact approved evidence", async ({
  page,
}) => {
  await signInSyntheticUser(page);
  await page.goto(`/tailoring/runs/${fixture.runId}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Resume suggestions" }),
  ).toBeVisible();
  await expect(
    page.getByText("Suggestions are ready for review."),
  ).toBeVisible();
  await expect(
    page
      .getByText("Built synthetic systems with approved evidence", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText(/Claim:.*Built synthetic systems/u),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Built synthetic systems" }),
  ).toBeVisible();
  await expect(page.getByText(/Synthetic browser fixture/u)).toBeVisible();
  await page.getByRole("radio", { name: "Accept" }).check();
  await page.getByRole("button", { name: "Commit review decisions" }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/documents/${fixture.documentId}[?]notice=tailoring-applied$`,
      "u",
    ),
  );
  await expect(
    page.getByText(
      "Accepted tailoring suggestions were saved as one immutable version.",
    ),
  ).toBeVisible();
  await expect(page.getByText("supported", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Tailor this resume" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Run estimated ATS analysis" }).click();
  await page
    .getByLabel("Reviewed job and evidence matches")
    .selectOption(fixture.jobId);
  await page
    .getByRole("button", { name: "Generate deterministic report" })
    .click();
  await expect(page).toHaveURL(/\/ats\/reports\/[0-9a-f-]+$/u);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Estimated ATS compatibility",
    }),
  ).toBeVisible();
  await expect(page.getByText("Category calculations")).toBeVisible();
  await expect(page.getByText("Explainable findings")).toBeVisible();
  await expect(page.getByText("ats-rules@1.0.0")).toBeVisible();
  await expect(page.getByText(/does not emulate a named ATS/u)).toBeVisible();
  await page.goto(`/exports?documentId=${fixture.documentId}`);
  await page.getByLabel("Export format").selectOption("pdf");
  await page.getByRole("button", { name: "Create private export" }).click();
  await expect(page.getByText(/Final artifact created/u)).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download .*\.pdf/u }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/u);
});

test("user inspects a grounded cover-letter paragraph without invented company claims", async ({
  page,
}) => {
  await signInSyntheticUser(page);
  await page.goto(`/tailoring/runs/${fixture.coverLetterRunId}`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Cover-letter suggestions",
    }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Built synthetic systems with approved evidence", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Built synthetic systems" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Accept" }).check();
  await page
    .getByLabel("Text to use if accepted")
    .fill("User-authored assertion requiring verification");
  await page.getByRole("button", { name: "Commit review decisions" }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/documents/${fixture.coverLetterDocumentId}[?]notice=tailoring-applied$`,
      "u",
    ),
  );
  await expect(page.getByText("unverified", { exact: true })).toBeVisible();
  await page.goto(`/exports?documentId=${fixture.coverLetterDocumentId}`);
  await page.getByLabel("Export format").selectOption("docx");
  await page.getByRole("button", { name: "Create private export" }).click();
  await expect(
    page.getByText(/requires current approved evidence/u),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Review and remediate claim support" })
    .click();
  await page
    .getByRole("button", { name: "Approve fact and create version" })
    .click();
  await expect(
    page.getByText(
      "Claim support was saved as a new immutable document version.",
    ),
  ).toBeVisible();
  await expect(page.getByText("supported", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Tailor this cover letter" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Export document" }).click();
  await page.getByLabel("Export format").selectOption("docx");
  await page.getByRole("button", { name: "Create private export" }).click();
  await expect(page.getByText(/Final artifact created/u)).toBeVisible();
});
