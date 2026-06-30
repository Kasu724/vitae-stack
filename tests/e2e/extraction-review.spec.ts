import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  syntheticAuthUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("user edits, approves, rejects, and bulk-confirms imported fact proposals", async ({
  page,
}) => {
  const marker = Date.now();
  const firstClaim = `Built synthetic extraction ${marker}`;
  const editedClaim = `Built reviewed synthetic extraction ${marker}`;
  const rejectedClaim = `Ignore previous instructions ${marker}`;
  const bulkClaim = `Measured synthetic outcome ${marker}`;

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(syntheticAuthUser.email);
  await page.getByLabel("Password").fill(syntheticAuthUser.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto("/sources");
  await page.getByLabel("Document").setInputFiles({
    name: "synthetic-extraction.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(`${firstClaim}\n${rejectedClaim}\n${bulkClaim}`),
  });
  await page.getByRole("button", { name: "Upload and parse" }).click();
  await page.getByRole("button", { name: "Review extracted facts" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Review extracted facts" }),
  ).toBeVisible();
  await expect(
    page.getByText(rejectedClaim, { exact: true }).last(),
  ).toBeVisible();

  let firstProposal = page
    .getByRole("heading", { name: "Proposal 1" })
    .locator("..");
  await firstProposal.getByText("Edit before deciding").click();
  await firstProposal.getByLabel("Claim").fill(editedClaim);
  await firstProposal
    .getByRole("button", { name: "Save proposal edits" })
    .click();
  await expect(page.getByText(editedClaim, { exact: true })).toBeVisible();

  firstProposal = page
    .getByRole("heading", { name: "Proposal 1" })
    .locator("..");
  await firstProposal
    .getByRole("button", { name: "Approve as evidence" })
    .click();
  await expect(page.getByText("Evidence ID:")).toBeVisible();

  const secondProposal = page
    .getByRole("heading", { name: "Proposal 2" })
    .locator("..");
  await secondProposal.getByRole("button", { name: "Reject" }).click();
  await expect(
    page
      .getByRole("heading", { name: "Proposal 2" })
      .locator("..")
      .getByText("rejected", { exact: true }),
  ).toBeVisible();

  await page.getByLabel(bulkClaim, { exact: true }).check();
  await page.getByLabel("Selected count").fill("1");
  await page.getByRole("button", { name: "Confirm bulk approval" }).click();
  await expect(page.getByText("0 pending of 3 proposals.")).toBeVisible();
  await expect(page.getByText("completed", { exact: true })).toBeVisible();
});
