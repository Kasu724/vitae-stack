import { readFile } from "node:fs/promises";

import { hashPassword } from "better-auth/crypto";

import { parseServerEnvironment } from "../src/infrastructure/config/environment-schema";
import { createDatabaseConnection } from "../src/infrastructure/database/connection";

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) {
    throw new Error(
      "Usage: pnpm auth:claim-trusted-local -- --email <address> --name <display-name>",
    );
  }
  return value;
}

const passwordFile = process.env.AUTH_CLAIM_PASSWORD_FILE;
if (!passwordFile) {
  throw new Error(
    "AUTH_CLAIM_PASSWORD_FILE must point to a mounted, access-restricted password file.",
  );
}
const password = (await readFile(passwordFile, "utf8")).trimEnd();
if (password.length < 12 || password.length > 128) {
  throw new Error("Password must contain between 12 and 128 characters.");
}

const email = argument("email");
const name = argument("name");
const environment = parseServerEnvironment(process.env);
if (environment.AUTH_MODE !== "trusted-local") {
  throw new Error(
    "Claim requires trusted-local mode while the app is stopped.",
  );
}

const connection = createDatabaseConnection(environment.DATABASE_URL, {
  maxConnections: 1,
});
const client = await connection.pool.connect();
try {
  await client.query("BEGIN");
  const localUser = await client.query<{
    user_id: string;
    workspace_id: string;
  }>(
    `SELECT users.id AS user_id, workspace_memberships.workspace_id
     FROM users
     JOIN workspace_memberships ON workspace_memberships.user_id = users.id
     WHERE users.email = 'trusted-local@vitae.invalid'
     FOR UPDATE OF users`,
  );
  const row = localUser.rows[0];
  if (!row) throw new Error("Trusted-local identity was not found.");

  const passwordHash = await hashPassword(password);
  await client.query(
    `UPDATE users
     SET email = $1, name = $2, email_verified = true, updated_at = now()
     WHERE id = $3`,
    [email, name, row.user_id],
  );
  await client.query(
    `INSERT INTO accounts
     (id, account_id, provider_id, user_id, password)
     VALUES (gen_random_uuid(), $1, 'credential', $2, $3)`,
    [row.user_id, row.user_id, passwordHash],
  );
  await client.query(
    `INSERT INTO audit_events
       (workspace_id, actor_user_id, action, target_type, target_id, outcome, correlation_id, metadata)
     VALUES ($1, $2, 'auth.trusted-local.claim', 'user', $2, 'succeeded', $3, '{}'::jsonb)`,
    [row.workspace_id, row.user_id, `trusted-local-claim:${row.user_id}`],
  );
  await client.query("COMMIT");
  console.log(
    "Trusted-local identity claimed. Restart with AUTH_MODE=password after taking a backup.",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await connection.pool.end();
}
