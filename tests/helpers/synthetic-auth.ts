import { createDatabaseConnection } from "@/infrastructure/database/connection";
import { createVitaeAuth } from "@/modules/auth/auth-factory";
import { provisionPersonalWorkspace } from "@/modules/auth/workspace-access";
import { expect, type Page } from "@playwright/test";

export const syntheticAuthUser = {
  email: "e2e-owner@example.test",
  name: "E2E Synthetic Owner",
  password: "synthetic-e2e-password-123",
};

export interface SyntheticAuthUser {
  email: string;
  name: string;
  password: string;
}

export async function ensureSyntheticAuthUser(
  user: SyntheticAuthUser = syntheticAuthUser,
): Promise<void> {
  const connection = createDatabaseConnection(
    process.env.DATABASE_URL ??
      "postgresql://vitae_app:vitae-app-dev-only@127.0.0.1:5432/vitae",
    { maxConnections: 2 },
  );
  const lock = await connection.pool.connect();
  try {
    await lock.query("SET lock_timeout = 0");
    await lock.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
      `synthetic-browser-user:${user.email}`,
    ]);
    // Browser suites are repeatable against a persistent local test database.
    // This helper is never used by the application or production runtime.
    await connection.pool.query("DELETE FROM rate_limits");
    const existing = await connection.pool.query<{ id: string; name: string }>(
      "SELECT id, name FROM users WHERE email = $1",
      [user.email],
    );
    if (existing.rows[0]) {
      await provisionPersonalWorkspace(connection.pool, {
        userId: existing.rows[0].id,
        displayName: existing.rows[0].name,
        mode: "password",
      });
      return;
    }

    const auth = createVitaeAuth({
      allowSignUp: true,
      baseURL: "http://127.0.0.1:3000",
      database: connection.database,
      secret: "development-only-auth-secret-change-me",
      secureCookies: false,
    });
    const signup = await auth.api.signUpEmail({ body: user });
    await provisionPersonalWorkspace(connection.pool, {
      userId: signup.user.id,
      displayName: signup.user.name,
      mode: "password",
    });
  } finally {
    await lock
      .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
        `synthetic-browser-user:${user.email}`,
      ])
      .catch(() => undefined);
    lock.release();
    await connection.pool.end();
  }
}

export async function signInSyntheticUser(
  page: Page,
  user: SyntheticAuthUser = syntheticAuthUser,
): Promise<void> {
  const connection = createDatabaseConnection(
    process.env.DATABASE_URL ??
      "postgresql://vitae_app:vitae-app-dev-only@127.0.0.1:5432/vitae",
    { maxConnections: 1 },
  );
  const lock = await connection.pool.connect();
  try {
    await lock.query("SET lock_timeout = 0");
    await lock.query(
      "SELECT pg_advisory_lock(hashtextextended('synthetic-browser-sign-in', 0))",
    );
    await lock.query("DELETE FROM rate_limits");
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/u);
  } finally {
    await lock
      .query(
        "SELECT pg_advisory_unlock(hashtextextended('synthetic-browser-sign-in', 0))",
      )
      .catch(() => undefined);
    lock.release();
    await connection.pool.end();
  }
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
