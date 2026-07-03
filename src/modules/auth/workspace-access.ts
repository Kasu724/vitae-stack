import type { Pool } from "@/infrastructure/database/sqlite-pool";

export type AuthenticationMode = "trusted-local";

export interface WorkspacePrincipal {
  authenticatedAt: Date;
  mode: AuthenticationMode;
  sessionId?: string;
  userId: string;
  workspaceId: string;
}

export class AuthorizationError extends Error {
  public constructor() {
    super("The requested resource is unavailable.");
    this.name = "AuthorizationError";
  }
}

export function requireWorkspaceAccess(
  principal: WorkspacePrincipal,
  workspaceId: string,
): void {
  if (principal.workspaceId !== workspaceId) {
    throw new AuthorizationError();
  }
}

export function requireRecentAuthentication(
  _principal: WorkspacePrincipal,
  _maximumAgeMs = 15 * 60 * 1000,
  _now = new Date(),
): void {
  void _maximumAgeMs;
  void _now;
  // Loopback-only local mode has no account session to reauthenticate.
}

export async function provisionPersonalWorkspace(
  pool: Pool,
  input: { userId: string; displayName: string; mode: AuthenticationMode },
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [input.userId],
    );
    const existing = await client.query<{ workspace_id: string }>(
      `SELECT workspace_id
       FROM workspace_memberships
       WHERE user_id = $1`,
      [input.userId],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return existing.rows[0].workspace_id;
    }

    const workspace = await client.query<{ id: string }>(
      `INSERT INTO workspaces (owner_user_id, name)
       VALUES ($1, $2)
       RETURNING id`,
      [input.userId, `${input.displayName}'s workspace`],
    );
    const workspaceId = workspace.rows[0]!.id;
    await client.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [workspaceId, input.userId],
    );
    await client.query(
      `INSERT INTO career_profiles (workspace_id, display_name)
       VALUES ($1, $2)`,
      [workspaceId, input.displayName],
    );
    await client.query(
      `INSERT INTO audit_events
         (workspace_id, actor_user_id, action, target_type, target_id, outcome, correlation_id, metadata)
       VALUES ($1, $2, 'workspace.create', 'workspace', $1, 'succeeded', $3, $4::jsonb)`,
      [
        workspaceId,
        input.userId,
        `workspace-bootstrap:${workspaceId}`,
        JSON.stringify({ mode: input.mode }),
      ],
    );
    await client.query("COMMIT");
    return workspaceId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureTrustedLocalPrincipal(
  pool: Pool,
): Promise<WorkspacePrincipal> {
  const user = await pool.query<{ id: string; name: string }>(
    `INSERT INTO users (email, name, email_verified)
     VALUES ('trusted-local@vitae.invalid', 'Local user', true)
     ON CONFLICT (email) DO UPDATE SET updated_at = users.updated_at
     RETURNING id, name`,
  );
  const row = user.rows[0]!;
  const workspaceId = await provisionPersonalWorkspace(pool, {
    userId: row.id,
    displayName: row.name,
    mode: "trusted-local",
  });

  return {
    authenticatedAt: new Date(),
    mode: "trusted-local",
    userId: row.id,
    workspaceId,
  };
}
