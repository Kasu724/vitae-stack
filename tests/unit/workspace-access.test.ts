import { describe, expect, it } from "vitest";

import {
  AuthorizationError,
  requireRecentAuthentication,
  requireWorkspaceAccess,
  type WorkspacePrincipal,
} from "@/modules/auth/workspace-access";

const principal: WorkspacePrincipal = {
  authenticatedAt: new Date("2026-06-29T00:00:00Z"),
  mode: "password",
  sessionId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  workspaceId: "00000000-0000-4000-8000-000000000003",
};

describe("workspace authorization", () => {
  it("allows only the principal's server-resolved workspace", () => {
    expect(() =>
      requireWorkspaceAccess(principal, principal.workspaceId),
    ).not.toThrow();
    expect(() =>
      requireWorkspaceAccess(principal, "00000000-0000-4000-8000-000000000004"),
    ).toThrow(AuthorizationError);
  });

  it("requires a fresh password session for sensitive operations", () => {
    expect(() =>
      requireRecentAuthentication(
        principal,
        15 * 60 * 1000,
        new Date("2026-06-29T00:14:59Z"),
      ),
    ).not.toThrow();
    expect(() =>
      requireRecentAuthentication(
        principal,
        15 * 60 * 1000,
        new Date("2026-06-29T00:15:01Z"),
      ),
    ).toThrow(AuthorizationError);
  });
});
