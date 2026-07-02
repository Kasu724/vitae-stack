import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

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
import { UnsafeUploadError } from "@/modules/ingestion/file-validation";
import { readBoundedMultipartUpload } from "@/modules/ingestion/multipart-upload";
import { PORTABILITY_MAX_BYTES } from "@/modules/portability/domain";
import {
  PortabilityConflictError,
  PortabilityService,
  PortabilityValidationError,
} from "@/modules/portability/service";

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
    const upload = await readBoundedMultipartUpload(
      request,
      PORTABILITY_MAX_BYTES,
    );
    const mode = upload.purpose;
    if (
      (mode !== "dry-run" && mode !== "apply") ||
      !upload.filename.toLowerCase().endsWith(".json") ||
      !new Set([
        "application/json",
        "text/json",
        "application/octet-stream",
      ]).has(upload.mediaType)
    )
      return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
    const service = new PortabilityService(
      getRuntimePool(),
      new FilesystemArtifactStore(environment.ARTIFACT_STORAGE_ROOT),
    );
    const archive = service.parse(upload.bytes);
    const preview =
      mode === "apply"
        ? await service.importArchive(principal, archive)
        : await service.preview(principal, archive);
    return NextResponse.json({
      mode,
      preview,
      applied: mode === "apply",
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
    if (error instanceof PortabilityConflictError)
      return NextResponse.json({ code: "IMPORT_CONFLICT" }, { status: 409 });
    if (error instanceof PortabilityValidationError)
      return NextResponse.json(
        { code: "INVALID_ARCHIVE", message: error.message },
        { status: 400 },
      );
    if (error instanceof UnsafeUploadError)
      return NextResponse.json(
        {
          code: error.code,
          message: "The archive upload was rejected safely.",
        },
        { status: 400 },
      );
    return NextResponse.json({ code: "IMPORT_FAILED" }, { status: 500 });
  }
}
