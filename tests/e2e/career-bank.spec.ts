import { expect, test } from "@playwright/test";

import {
  ensureSyntheticAuthUser,
  signInSyntheticUser,
} from "../helpers/synthetic-auth";

test.beforeAll(async () => {
  await ensureSyntheticAuthUser();
});

test("invalid career entry submission preserves every field", async ({
  page,
}) => {
  await signInSyntheticUser(page);
  await page
    .getByRole("link", { name: "Open Career Information Bank" })
    .click();
  await page.getByRole("link", { name: "Add career entry" }).click();

  await page.getByLabel("Role or item name").fill("Preserved validation title");
  await page
    .getByLabel("Organization")
    .fill("Preserved validation organization");
  await page.getByLabel("Start date").fill("2026-02-30");
  await page.getByLabel("End date").fill("2025-12-01");
  await page.getByLabel("Item notes").fill("Preserved validation description");
  await page.getByRole("button", { name: "Create entry" }).click();

  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Correct the highlighted fields and try again." });
  await expect(alert).toBeFocused();
  await expect(alert).toContainText("Enter a valid calendar date");
  await expect(page.getByLabel("Role or item name")).toHaveValue(
    "Preserved validation title",
  );
  await expect(page.getByLabel("Organization")).toHaveValue(
    "Preserved validation organization",
  );
  await expect(page.getByLabel("Start date")).toHaveValue("2026-02-30");
  await expect(page.getByLabel("End date")).toHaveValue("2025-12-01");
  await expect(page.getByLabel("Item notes")).toHaveValue(
    "Preserved validation description",
  );
  await expect(page.getByLabel("Start date")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("user creates an entry and explicitly approves grounded evidence", async ({
  page,
}) => {
  const title = `Synthetic E2E project ${Date.now()}`;
  await signInSyntheticUser(page);
  await page
    .getByRole("link", { name: "Open Career Information Bank" })
    .click();

  await page.getByRole("link", { name: "Add career entry" }).click();
  await page.getByLabel("Entry type").selectOption("project");
  await page.getByLabel("Project name").fill(title);
  await page.getByLabel("Item notes").fill("Synthetic browser workflow only");
  await page.getByLabel("Tags").fill("e2e, privacy");
  await page.getByRole("button", { name: "Create entry" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();

  await page
    .getByLabel("Bullet, claim, or value")
    .first()
    .fill("Built a synthetic privacy control");
  await page.getByRole("button", { name: "Add proposal" }).click();
  await expect(page.getByText(/not verified or eligible/u)).toBeVisible();
  await page.getByRole("button", { name: "Approve fact" }).click();
  await expect(page.getByText(/immutable evidence identifier/u)).toBeVisible();
  await expect(
    page.getByText("Built a synthetic privacy control", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText(/Evidence ID:/u)).toBeVisible();

  await page.getByRole("button", { name: "Archive entry" }).click();
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
});
