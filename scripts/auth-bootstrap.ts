import { readFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";

import { parseServerEnvironment } from "../src/infrastructure/config/environment-schema";
import { createDatabaseConnection } from "../src/infrastructure/database/connection";
import { createVitaeAuth } from "../src/modules/auth/auth-factory";
import { provisionPersonalWorkspace } from "../src/modules/auth/workspace-access";

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Hidden password input requires a TTY; use AUTH_BOOTSTRAP_PASSWORD_FILE for a mounted secret.",
    );
  }

  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const terminal = createInterface({
    input: process.stdin,
    output: muted,
    terminal: true,
  });
  process.stdout.write(prompt);
  try {
    const value = await terminal.question("");
    process.stdout.write("\n");
    return value;
  } finally {
    terminal.close();
  }
}

async function readPassword(): Promise<string> {
  const passwordFile = process.env.AUTH_BOOTSTRAP_PASSWORD_FILE;
  if (passwordFile) {
    return (await readFile(passwordFile, "utf8")).trimEnd();
  }

  const password = await readHidden("Password: ");
  const confirmation = await readHidden("Confirm password: ");
  if (password !== confirmation) {
    throw new Error("Password confirmation does not match.");
  }
  return password;
}

const email = readArgument("email");
const name = readArgument("name");
if (!email || !name) {
  throw new Error(
    "Usage: pnpm auth:bootstrap -- --email <address> --name <display-name>",
  );
}

const environment = parseServerEnvironment(process.env);
if (environment.AUTH_MODE !== "password") {
  throw new Error("Bootstrap is available only in password mode.");
}
const connection = createDatabaseConnection(environment.DATABASE_URL, {
  maxConnections: 2,
});
const pool = connection.pool;
const auth = createVitaeAuth({
  allowSignUp: true,
  baseURL: environment.BETTER_AUTH_URL,
  database: connection.database,
  secret: environment.BETTER_AUTH_SECRET,
  secureCookies: false,
});
const existing = await pool.query<{ count: string }>(
  "SELECT count(*)::text AS count FROM users",
);
if (Number(existing.rows[0]!.count) > 0) {
  throw new Error("Bootstrap refused because an account already exists.");
}

const password = await readPassword();
let createdUserId: string | undefined;
try {
  const result = await auth.api.signUpEmail({
    body: { email, name, password },
  });
  createdUserId = result.user.id;
  await provisionPersonalWorkspace(pool, {
    userId: createdUserId,
    displayName: name,
    mode: "password",
  });
  console.log("Bootstrap account and personal workspace created.");
} catch (error) {
  if (createdUserId) {
    await pool.query("DELETE FROM users WHERE id = $1", [createdUserId]);
  }
  throw error;
} finally {
  await pool.end();
}
