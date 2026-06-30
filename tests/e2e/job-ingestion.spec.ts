import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  syntheticAuthUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("user saves pasted and file-based immutable job snapshots", async ({
  page,
}) => {
  const marker = Date.now();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(syntheticAuthUser.email);
  await page.getByLabel("Password").fill(syntheticAuthUser.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Add a job description" }).click();

  await page.getByLabel("Role title").first().fill(`Synthetic role ${marker}`);
  await page.getByLabel("Company").first().fill("Example Company");
  await page
    .getByLabel("Job description")
    .fill("Build synthetic systems\r\nReview evidence controls");
  await page.getByRole("button", { name: "Save job snapshot" }).click();
  await expect(
    page.getByText("The pasted job snapshot was saved."),
  ).toBeVisible();
  await expect(
    page.getByText("Revision 1", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByLabel("Corrected job description")
    .fill("Build corrected synthetic systems");
  await page.getByRole("button", { name: "Create corrected revision" }).click();
  await expect(
    page.getByText("Revision 2", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Revision 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Analyze without AI" }).click();
  await expect(
    page.getByText("A requirement draft was created for review."),
  ).toBeVisible();
  await page.getByLabel("Decision").selectOption("accepted");
  await page.getByRole("button", { name: "Save review decision" }).click();
  await page
    .getByRole("button", { name: "Finalize reviewed requirements" })
    .click();
  await expect(
    page.getByText(
      "The reviewed requirements were saved as an immutable revision.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Build corrected synthetic systems"),
  ).toBeVisible();

  await page.goto("/jobs");
  await page.getByLabel("Job-description file").setInputFiles({
    name: "synthetic-job.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      `# Synthetic file role ${marker}\n\nEmployer requirement`,
    ),
  });
  await page.getByRole("button", { name: "Upload and review file" }).click();
  await expect(
    page.getByText(/does not treat job claims as your career evidence/u),
  ).toBeVisible();
  await page.getByLabel("Role title").fill(`Synthetic file role ${marker}`);
  await page.getByRole("button", { name: "Save job snapshot" }).click();
  await expect(
    page.getByText(
      "The reviewed file text was saved as an immutable job snapshot.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Input: file", { exact: false })).toBeVisible();

  await page.goto("/jobs");
  const urlSection = page
    .getByRole("heading", { name: "Public HTTPS URL" })
    .locator("..");
  await urlSection.getByLabel("Role title").fill("Blocked synthetic URL role");
  await urlSection.getByLabel("Job URL").fill("http://127.0.0.1/private");
  await urlSection
    .getByRole("button", { name: "Fetch public job page" })
    .click();
  await expect(
    page.getByText(/cannot be fetched under the public HTTPS policy/u),
  ).toBeVisible();
});
