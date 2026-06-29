import "server-only";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";

import { getAuth } from "./server";
import {
  ensureTrustedLocalPrincipal,
  type WorkspacePrincipal,
} from "./workspace-access";

export async function getCurrentPrincipal(
  requestHeaders: Headers,
): Promise<WorkspacePrincipal | null> {
  const environment = readServerEnvironment();
  const pool = getRuntimePool();

  if (environment.AUTH_MODE === "trusted-local") {
    return ensureTrustedLocalPrincipal(pool);
  }

  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const membership = await pool.query<{ workspace_id: string }>(
    `SELECT workspace_id
     FROM workspace_memberships
     WHERE user_id = $1`,
    [session.user.id],
  );
  const workspace = membership.rows[0];
  if (!workspace) return null;

  return {
    authenticatedAt: new Date(session.session.createdAt),
    mode: "password",
    sessionId: session.session.id,
    userId: session.user.id,
    workspaceId: workspace.workspace_id,
  };
}
