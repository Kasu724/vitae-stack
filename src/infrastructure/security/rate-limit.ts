import { createHash } from "node:crypto";

import type { Pool } from "pg";

export const APPLICATION_RATE_LIMIT_SCOPES = [
  "provider-test",
  "provider-task",
  "portability-export",
  "portability-import",
] as const;

export class ApplicationRateLimitError extends Error {
  public readonly retryAfterSeconds: number;

  public constructor(retryAfterSeconds: number) {
    super("The operation rate limit was reached.");
    this.name = "ApplicationRateLimitError";
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

export function applicationRateLimitKey(
  scope: string,
  subject: string,
): string {
  if (!/^[a-z][a-z0-9-]{1,50}$/u.test(scope) || subject.length === 0)
    throw new Error("INVALID_RATE_LIMIT_SCOPE");
  const digest = createHash("sha256").update(subject).digest("hex");
  return `app:${scope}:${digest}`;
}

export async function consumeApplicationRateLimit(
  pool: Pool,
  input: {
    scope: string;
    subject: string;
    limit: number;
    windowMs: number;
    now?: number;
  },
): Promise<void> {
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    !Number.isInteger(input.windowMs) ||
    input.windowMs < 1_000
  )
    throw new Error("INVALID_RATE_LIMIT_POLICY");
  const key = applicationRateLimitKey(input.scope, input.subject);
  const now = input.now ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      key,
    ]);
    const current = await client.query<{ count: number; last_request: number }>(
      "SELECT count,last_request FROM rate_limits WHERE key=$1 FOR UPDATE",
      [key],
    );
    const row = current.rows[0];
    if (!row || now - row.last_request >= input.windowMs) {
      await client.query(
        `INSERT INTO rate_limits (key,count,last_request) VALUES ($1,1,$2)
         ON CONFLICT (key) DO UPDATE SET count=1,last_request=EXCLUDED.last_request`,
        [key, now],
      );
    } else {
      if (row.count >= input.limit)
        throw new ApplicationRateLimitError(
          (input.windowMs - (now - row.last_request)) / 1_000,
        );
      await client.query("UPDATE rate_limits SET count=count+1 WHERE key=$1", [
        key,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
