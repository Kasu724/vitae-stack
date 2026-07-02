import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { FilesystemArtifactStore } from "@/infrastructure/artifacts/filesystem-store";
import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { ApplicationRateLimitError } from "@/infrastructure/security/rate-limit";
import { isTrustedRequestOrigin } from "@/modules/auth/auth-request-handler";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  AuthorizationError,
  requireRecentAuthentication,
} from "@/modules/auth/workspace-access";
import { PortabilityService } from "@/modules/portability/service";

const requestSchema = z.object({
  includeSources: z.boolean().default(false),
  includeArtifacts: z.boolean().default(false),
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
    requireRecentAuthentication(principal);
    const options = requestSchema.parse(await request.json());
    const bytes = await new PortabilityService(
      getRuntimePool(),
      new FilesystemArtifactStore(environment.ARTIFACT_STORAGE_ROOT),
    ).exportArchive(principal, options);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(bytes.toString("utf8"), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="vitae-stack-${date}.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ApplicationRateLimitError)
      return NextResponse.json(
        { code: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    if (error instanceof AuthorizationError)
      return NextResponse.json(
        { code: "RECENT_AUTHENTICATION_REQUIRED" },
        { status: 401 },
      );
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
    return NextResponse.json({ code: "EXPORT_FAILED" }, { status: 400 });
  }
}
