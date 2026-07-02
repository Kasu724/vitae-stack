import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { isTrustedRequestOrigin } from "@/modules/auth/auth-request-handler";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { AuthorizationError } from "@/modules/auth/workspace-access";
import { WorkspaceDeletionService } from "@/modules/privacy/workspace-deletion-service";

const requestSchema = z.object({
  confirmation: z.literal("DELETE MY WORKSPACE"),
});

export async function POST(request: NextRequest) {
  const environment = readServerEnvironment();
  if (!isTrustedRequestOrigin(request, environment.BETTER_AUTH_URL))
    return NextResponse.json({ code: "UNTRUSTED_ORIGIN" }, { status: 403 });
  const principal = await getCurrentPrincipal(await headers());
  if (!principal)
    return NextResponse.json(
      { code: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  try {
    requestSchema.parse(await request.json());
    const service = new WorkspaceDeletionService(getRuntimePool(), environment);
    const requested = await service.request(principal);
    const completed = await service.process(requested.operationId);
    return NextResponse.json({
      operationId: completed.operationId,
      state: completed.state,
      requestedAt: completed.requestedAt.toISOString(),
      completedAt: completed.completedAt?.toISOString() ?? null,
      backupExpiresAt: completed.backupExpiresAt.toISOString(),
      deletedCounts: completed.deletedCounts,
      errorCode: completed.errorCode,
    });
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json(
        { code: "RECENT_AUTHENTICATION_REQUIRED" },
        { status: 401 },
      );
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json(
        { code: "CONFIRMATION_REQUIRED" },
        { status: 400 },
      );
    return NextResponse.json({ code: "DELETION_FAILED" }, { status: 500 });
  }
}
