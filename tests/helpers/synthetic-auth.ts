import { createDatabaseConnection } from "@/infrastructure/database/connection";
import { ensureTrustedLocalPrincipal } from "@/modules/auth/workspace-access";
import { expect, type Page } from "@playwright/test";

export const syntheticAuthUser = {
  email: "trusted-local@vitae.invalid",
  name: "Local user",
};

export interface SyntheticAuthUser {
  email: string;
  name: string;
}

export async function ensureSyntheticAuthUser(
  _user: SyntheticAuthUser = syntheticAuthUser,
): Promise<void> {
  void _user;
  const connection = createDatabaseConnection(
    process.env.DATABASE_PATH ?? "./var/vitae.sqlite",
  );
  try {
    await ensureTrustedLocalPrincipal(connection.pool);
  } finally {
    await connection.pool.end();
  }
}

export async function signInSyntheticUser(
  page: Page,
  _user: SyntheticAuthUser = syntheticAuthUser,
): Promise<void> {
  void _user;
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/u);
}

export async function waitForSourceReady(page: Page): Promise<void> {
  await page.waitForURL(/\/sources\/[0-9a-f-]+$/u);
  const ready = page.getByText("ready", { exact: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await ready.isVisible()) return;
    const refresh = page.getByRole("link", { name: "Check status" });
    if (await refresh.isVisible()) await refresh.click();
    else await page.reload();
    await page.waitForTimeout(250);
  }
  await expect(ready).toBeVisible();
}
