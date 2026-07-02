import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  signInSyntheticUser,
  waitForSourceReady,
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

  await signInSyntheticUser(page);
  await page.goto("/sources");
  await page
    .getByRole("region", { name: "Import a document" })
    .getByLabel("Document")
    .setInputFiles({
      name: "synthetic-extraction.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(`${firstClaim}\n${rejectedClaim}\n${bulkClaim}`),
    });
  await page.getByRole("button", { name: "Upload and parse" }).click();
  await waitForSourceReady(page);
  await page.getByRole("button", { name: "Review extracted facts" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Review extracted facts" }),
  ).toBeVisible();
  const proposalFor = (claim: string) =>
    page
      .getByRole("listitem")
      .filter({ hasText: claim })
      .filter({
        has: page.getByRole("button", { name: "Approve as evidence" }),
      });
  await expect(proposalFor(rejectedClaim)).toBeVisible();

  let firstProposal = proposalFor(firstClaim);
  await firstProposal.getByText("Edit before deciding").click();
  await firstProposal.getByLabel("Claim").fill(editedClaim);
  await firstProposal
    .getByRole("button", { name: "Save proposal edits" })
    .click();
  firstProposal = proposalFor(editedClaim);
  await expect(
    firstProposal.getByText(editedClaim, { exact: true }).first(),
  ).toBeVisible();
  await firstProposal
    .getByRole("button", { name: "Approve as evidence" })
    .click();
  await expect(page.getByText("Evidence ID:")).toBeVisible();

  await proposalFor(rejectedClaim)
    .getByRole("button", { name: "Reject" })
    .click();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: rejectedClaim })
      .getByText("rejected", { exact: true }),
  ).toBeVisible();

  await page.getByLabel(bulkClaim, { exact: true }).check();
  await page.getByLabel("Selected count").fill("1");
  await page.getByRole("button", { name: "Confirm bulk approval" }).click();
  await expect(page.getByText("0 pending of 3 proposals.")).toBeVisible();
  await expect(page.getByText("completed", { exact: true })).toBeVisible();
});
