// @vitest-environment node

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseConnection } from "@/infrastructure/database/connection";
import { migrateDatabase } from "@/infrastructure/database/migration";
import { createVitaeAuth, type VitaeAuth } from "@/modules/auth/auth-factory";
import { handleAuthRequest } from "@/modules/auth/auth-request-handler";
import {
  ensureTrustedLocalPrincipal,
  provisionPersonalWorkspace,
} from "@/modules/auth/workspace-access";

const baseURL = "http://127.0.0.1:3000";
const email = "owner@example.test";
const password = "synthetic-password-123";
const runtimePassword = "synthetic-runtime-password";
const execFileAsync = promisify(execFile);

let container: StartedPostgreSqlContainer;
let ownerPool: Pool;
let runtimePool: Pool;
let auth: VitaeAuth;
let secureAuth: VitaeAuth;

function runtimeUrl() {
  return runtimeDatabaseUrl(container.getDatabase());
}

function runtimeDatabaseUrl(database: string) {
  return `postgresql://vitae_app:${runtimePassword}@${container.getHost()}:${container.getPort()}/${database}`;
}

function authRequest(
  path: string,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return new Request(`${baseURL}/api/auth${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      origin: baseURL,
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Expected a session cookie.");
  const match = setCookie.match(/(?:^|,\s*)(vitae\.session_token=[^;]+)/u);
  if (!match?.[1]) throw new Error("Expected the Vitae session cookie.");
  return match[1];
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.4-bookworm")
    .withDatabase("vitae_auth_test")
    .withUsername("postgres")
    .withPassword("synthetic-admin-password")
    .start();
  ownerPool = new Pool({ connectionString: container.getConnectionUri() });
  await ownerPool.query(
    `CREATE ROLE vitae_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${runtimePassword}'`,
  );
  await ownerPool.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  const migration = createDatabaseConnection(container.getConnectionUri(), {
    maxConnections: 1,
  });
  await migrateDatabase(migration.database);
  await migration.pool.end();

  const runtime = createDatabaseConnection(runtimeUrl());
  runtimePool = runtime.pool;
  const bootstrapAuth = createVitaeAuth({
    allowSignUp: true,
    baseURL,
    database: runtime.database,
    secret: "synthetic-auth-secret-at-least-32-bytes",
    secureCookies: false,
  });
  const signup = await bootstrapAuth.api.signUpEmail({
    body: { email, name: "Synthetic Owner", password },
  });
  await provisionPersonalWorkspace(runtimePool, {
    userId: signup.user.id,
    displayName: signup.user.name,
    mode: "password",
  });

  auth = createVitaeAuth({
    allowSignUp: false,
    baseURL,
    database: runtime.database,
    secret: "synthetic-auth-secret-at-least-32-bytes",
    secureCookies: false,
  });
  secureAuth = createVitaeAuth({
    allowSignUp: false,
    baseURL,
    database: runtime.database,
    secret: "synthetic-auth-secret-at-least-32-bytes",
    secureCookies: true,
  });
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await ownerPool?.end();
  await container?.stop();
});

describe("password authentication", () => {
  it("stores a password hash and provisions exactly one personal workspace", async () => {
    const account = await ownerPool.query<{
      password: string;
      provider_id: string;
    }>(
      `SELECT accounts.password, accounts.provider_id
       FROM accounts
       JOIN users ON users.id = accounts.user_id
       WHERE users.email = $1`,
      [email],
    );
    expect(account.rows[0]!.provider_id).toBe("credential");
    expect(account.rows[0]!.password).not.toBe(password);
    expect(account.rows[0]!.password.length).toBeGreaterThan(40);

    const ownership = await ownerPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM workspace_memberships
       JOIN users ON users.id = workspace_memberships.user_id
       WHERE users.email = $1`,
      [email],
    );
    expect(Number(ownership.rows[0]!.count)).toBe(1);
  });

  it("keeps public registration closed", async () => {
    const response = await handleAuthRequest(
      auth,
      authRequest("/sign-up/email", {
        email: "blocked@example.test",
        name: "Blocked user",
        password,
      }),
      baseURL,
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    const blocked = await ownerPool.query(
      "SELECT id FROM users WHERE email = 'blocked@example.test'",
    );
    expect(blocked.rowCount).toBe(0);
  });

  it("creates an HttpOnly SameSite session and revokes it on sign-out", async () => {
    const response = await handleAuthRequest(
      auth,
      authRequest("/sign-in/email", { email, password }),
      baseURL,
    );
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    const cookie = sessionCookie(response);

    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(session?.user.email).toBe(email);

    const signOut = await handleAuthRequest(
      auth,
      authRequest("/sign-out", {}, { cookie }),
      baseURL,
    );
    expect(signOut.status).toBe(200);
    await expect(
      auth.api.getSession({ headers: new Headers({ cookie }) }),
    ).resolves.toBeNull();
  });

  it("rejects a credentialed request from an untrusted origin", async () => {
    const signIn = await handleAuthRequest(
      auth,
      authRequest("/sign-in/email", { email, password }),
      baseURL,
    );
    const cookie = sessionCookie(signIn);
    const response = await handleAuthRequest(
      auth,
      authRequest("/sign-out", {}, { cookie, origin: "https://evil.invalid" }),
      baseURL,
    );
    expect(response.status).toBe(403);
  });

  it("issues distinct session tokens and supports secure production cookies", async () => {
    const first = await handleAuthRequest(
      auth,
      authRequest(
        "/sign-in/email",
        { email, password },
        { "x-forwarded-for": "192.0.2.60" },
      ),
      baseURL,
    );
    const second = await handleAuthRequest(
      auth,
      authRequest(
        "/sign-in/email",
        { email, password },
        { "x-forwarded-for": "192.0.2.61" },
      ),
      baseURL,
    );
    expect(sessionCookie(first)).not.toBe(sessionCookie(second));

    const secure = await handleAuthRequest(
      secureAuth,
      authRequest(
        "/sign-in/email",
        { email, password },
        { "x-forwarded-for": "192.0.2.62" },
      ),
      baseURL,
    );
    expect(secure.headers.get("set-cookie")?.toLowerCase()).toContain("secure");
  });

  it("does not distinguish an unknown account from a wrong password", async () => {
    const wrong = await handleAuthRequest(
      auth,
      authRequest("/sign-in/email", {
        email,
        password: "wrong-password-value",
      }),
      baseURL,
    );
    const unknown = await handleAuthRequest(
      auth,
      authRequest("/sign-in/email", {
        email: "unknown@example.test",
        password: "wrong-password-value",
      }),
      baseURL,
    );
    expect(unknown.status).toBe(wrong.status);
    const [wrongBody, unknownBody] = await Promise.all([
      wrong.json(),
      unknown.json(),
    ]);
    expect(unknownBody).toMatchObject(wrongBody as Record<string, unknown>);
  });

  it("rate limits repeated sign-in attempts in database storage", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await handleAuthRequest(
        auth,
        authRequest(
          "/sign-in/email",
          {
            email: "rate-limit@example.test",
            password: "wrong-password-value",
          },
          { "x-forwarded-for": "192.0.2.45" },
        ),
        baseURL,
      );
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
    const counters = await ownerPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM rate_limits",
    );
    expect(Number(counters.rows[0]!.count)).toBeGreaterThan(0);
  });

  it("operator reset rehashes the password, revokes sessions, and audits", async () => {
    const signIn = await handleAuthRequest(
      auth,
      authRequest(
        "/sign-in/email",
        { email, password },
        { "x-forwarded-for": "192.0.2.70" },
      ),
      baseURL,
    );
    const cookie = sessionCookie(signIn);
    const directory = await mkdtemp(path.join(tmpdir(), "vitae-reset-"));
    const passwordFile = path.join(directory, "password.txt");
    const replacement = "synthetic-replacement-password-456";
    await writeFile(passwordFile, `${replacement}\n`, { mode: 0o600 });
    try {
      const result = await execFileAsync(
        process.execPath,
        [
          path.resolve("node_modules/tsx/dist/cli.mjs"),
          path.resolve("scripts/auth-reset-password.ts"),
          "--email",
          email,
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            AUTH_MODE: "password",
            AUTH_RESET_PASSWORD_FILE: passwordFile,
            BETTER_AUTH_SECRET: "synthetic-auth-secret-at-least-32-bytes",
            BETTER_AUTH_URL: baseURL,
            DATABASE_URL: runtimeUrl(),
            NODE_ENV: "test",
          } satisfies NodeJS.ProcessEnv,
        },
      );
      expect(result.stdout).toContain("Password reset; all sessions revoked.");
      await expect(
        auth.api.getSession({ headers: new Headers({ cookie }) }),
      ).resolves.toBeNull();

      const oldPassword = await handleAuthRequest(
        auth,
        authRequest(
          "/sign-in/email",
          { email, password },
          { "x-forwarded-for": "192.0.2.71" },
        ),
        baseURL,
      );
      const newPassword = await handleAuthRequest(
        auth,
        authRequest(
          "/sign-in/email",
          { email, password: replacement },
          { "x-forwarded-for": "192.0.2.72" },
        ),
        baseURL,
      );
      expect(oldPassword.status).toBeGreaterThanOrEqual(400);
      expect(newPassword.status).toBe(200);

      const audit = await ownerPool.query(
        "SELECT id FROM audit_events WHERE action = 'auth.password.operator-reset'",
      );
      expect(audit.rowCount).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("trusted-local mode", () => {
  it("idempotently resolves one user and one workspace", async () => {
    const principals = await Promise.all(
      Array.from({ length: 4 }, () => ensureTrustedLocalPrincipal(runtimePool)),
    );
    expect(new Set(principals.map((item) => item.userId)).size).toBe(1);
    expect(new Set(principals.map((item) => item.workspaceId)).size).toBe(1);
  });

  it("claims the existing identity without changing workspace ownership", async () => {
    const before = await ensureTrustedLocalPrincipal(runtimePool);
    const directory = await mkdtemp(path.join(tmpdir(), "vitae-claim-"));
    const passwordFile = path.join(directory, "password.txt");
    const claimPassword = "synthetic-claim-password-789";
    await writeFile(passwordFile, `${claimPassword}\n`, { mode: 0o600 });
    try {
      const result = await execFileAsync(
        process.execPath,
        [
          path.resolve("node_modules/tsx/dist/cli.mjs"),
          path.resolve("scripts/auth-claim-trusted-local.ts"),
          "--email",
          "claimed-local@example.test",
          "--name",
          "Claimed Local Owner",
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            APP_BIND_HOST: "127.0.0.1",
            AUTH_CLAIM_PASSWORD_FILE: passwordFile,
            AUTH_MODE: "trusted-local",
            BETTER_AUTH_SECRET: "synthetic-claim-secret-at-least-32-bytes",
            BETTER_AUTH_URL: baseURL,
            DATABASE_URL: runtimeUrl(),
            NODE_ENV: "test",
          } satisfies NodeJS.ProcessEnv,
        },
      );
      expect(result.stdout).toContain("Trusted-local identity claimed.");

      const signIn = await handleAuthRequest(
        auth,
        authRequest(
          "/sign-in/email",
          { email: "claimed-local@example.test", password: claimPassword },
          { "x-forwarded-for": "192.0.2.80" },
        ),
        baseURL,
      );
      expect(signIn.status).toBe(200);
      const ownership = await ownerPool.query<{ workspace_id: string }>(
        `SELECT workspace_id
         FROM workspace_memberships
         JOIN users ON users.id = workspace_memberships.user_id
         WHERE users.email = 'claimed-local@example.test'`,
      );
      expect(ownership.rows[0]!.workspace_id).toBe(before.workspaceId);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("operator bootstrap command", () => {
  it("creates one account from a mounted password file and refuses reuse", async () => {
    const database = "bootstrap_command_test";
    await ownerPool.query(`CREATE DATABASE ${database}`);
    const migration = createDatabaseConnection(
      `postgresql://postgres:synthetic-admin-password@${container.getHost()}:${container.getPort()}/${database}`,
      { maxConnections: 1 },
    );
    await migrateDatabase(migration.database);
    await migration.pool.end();

    const directory = await mkdtemp(path.join(tmpdir(), "vitae-bootstrap-"));
    const passwordFile = path.join(directory, "password.txt");
    await writeFile(passwordFile, `${password}\n`, { mode: 0o600 });
    const command = process.execPath;
    const commandArguments = [
      path.resolve("node_modules/tsx/dist/cli.mjs"),
      path.resolve("scripts/auth-bootstrap.ts"),
      "--email",
      "bootstrap@example.test",
      "--name",
      "Bootstrap Owner",
    ];
    const environment = {
      ...process.env,
      AUTH_BOOTSTRAP_PASSWORD_FILE: passwordFile,
      AUTH_MODE: "password",
      BETTER_AUTH_SECRET: "synthetic-bootstrap-secret-at-least-32-bytes",
      BETTER_AUTH_URL: baseURL,
      DATABASE_URL: runtimeDatabaseUrl(database),
      NODE_ENV: "test",
    } satisfies NodeJS.ProcessEnv;

    try {
      const first = await execFileAsync(command, commandArguments, {
        cwd: process.cwd(),
        env: environment,
      });
      expect(first.stdout).toContain(
        "Bootstrap account and personal workspace created.",
      );

      await expect(
        execFileAsync(command, commandArguments, {
          cwd: process.cwd(),
          env: environment,
        }),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          "Bootstrap refused because an account already exists.",
        ),
      });

      const verification = new Pool({
        connectionString: runtimeDatabaseUrl(database),
      });
      const result = await verification.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM users
         JOIN workspace_memberships ON workspace_memberships.user_id = users.id
         WHERE users.email = 'bootstrap@example.test'`,
      );
      await verification.end();
      expect(Number(result.rows[0]!.count)).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
