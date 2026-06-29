import { readFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";

import { hashPassword } from "better-auth/crypto";

import { parseServerEnvironment } from "../src/infrastructure/config/environment-schema";
import { createDatabaseConnection } from "../src/infrastructure/database/connection";

function readEmail(): string {
  const index = process.argv.indexOf("--email");
  const email = index >= 0 ? process.argv[index + 1] : undefined;
  if (!email) {
    throw new Error("Usage: pnpm auth:reset-password -- --email <address>");
  }
  return email;
}

async function readHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Hidden password input requires a TTY; use AUTH_RESET_PASSWORD_FILE for a mounted secret.",
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

async function readNewPassword(): Promise<string> {
  const passwordFile = process.env.AUTH_RESET_PASSWORD_FILE;
  if (passwordFile) {
    return (await readFile(passwordFile, "utf8")).trimEnd();
  }
  const password = await readHidden("New password: ");
  const confirmation = await readHidden("Confirm new password: ");
  if (password !== confirmation) {
    throw new Error("Password confirmation does not match.");
  }
  return password;
}

const email = readEmail();
const password = await readNewPassword();
if (password.length < 12 || password.length > 128) {
  throw new Error("Password must contain between 12 and 128 characters.");
}

const environment = parseServerEnvironment(process.env);
if (environment.AUTH_MODE !== "password") {
  throw new Error("Password reset is available only in password mode.");
}
const connection = createDatabaseConnection(environment.DATABASE_URL, {
  maxConnections: 1,
});
const client = await connection.pool.connect();
try {
  await client.query("BEGIN");
  const account = await client.query<{
    account_id: string;
    user_id: string;
    workspace_id: string;
  }>(
    `SELECT accounts.account_id, accounts.user_id, workspace_memberships.workspace_id
     FROM accounts
     JOIN users ON users.id = accounts.user_id
     JOIN workspace_memberships ON workspace_memberships.user_id = users.id
     WHERE users.email = $1 AND accounts.provider_id = 'credential'
     FOR UPDATE OF accounts`,
    [email],
  );
  const row = account.rows[0];
  if (!row) throw new Error("Password reset target was not found.");

  const passwordHash = await hashPassword(password);
  await client.query(
    `UPDATE accounts
     SET password = $1, updated_at = now()
     WHERE provider_id = 'credential' AND account_id = $2`,
    [passwordHash, row.account_id],
  );
  await client.query("DELETE FROM sessions WHERE user_id = $1", [row.user_id]);
  await client.query(
    `INSERT INTO audit_events
       (workspace_id, actor_user_id, action, target_type, target_id, outcome, correlation_id, metadata)
     VALUES ($1, $2, 'auth.password.operator-reset', 'user', $2, 'succeeded', $3, '{}'::jsonb)`,
    [row.workspace_id, row.user_id, `operator-password-reset:${row.user_id}`],
  );
  await client.query("COMMIT");
  console.log("Password reset; all sessions revoked.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await connection.pool.end();
}
