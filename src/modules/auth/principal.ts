import "server-only";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";

import { DeletionTombstoneStore } from "@/modules/privacy/tombstone-store";
import {
  ensureTrustedLocalPrincipal,
  type WorkspacePrincipal,
  workspaceIsFrozenOrMissing,
} from "./workspace-access";

export async function getCurrentPrincipal(
  _requestHeaders: Headers,
): Promise<WorkspacePrincipal | null> {
  void _requestHeaders;
  const environment = readServerEnvironment();
  const pool = getRuntimePool();
  const principal = await ensureTrustedLocalPrincipal(pool);
  if (
    (await workspaceIsFrozenOrMissing(pool, principal.workspaceId)) ||
    (await new DeletionTombstoneStore(environment.ARTIFACT_STORAGE_ROOT).has(
      principal.workspaceId,
    ))
  )
    return null;
  return principal;
}
