import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { FilesystemArtifactStore } from "@/infrastructure/artifacts/filesystem-store";
import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { isTrustedRequestOrigin } from "@/modules/auth/auth-request-handler";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  ExportNotFoundError,
  ExportRateLimitError,
  ExportService,
} from "@/modules/exports/service";
import {
  exportFormatSchema,
  UnsupportedExportClaimsError,
} from "@/modules/exports/domain";

const requestSchema = z.object({
  documentId: z.string().uuid(),
  versionId: z.string().uuid(),
  format: exportFormatSchema,
});

export async function POST(request: NextRequest) {
  const environment = readServerEnvironment();
  if (!isTrustedRequestOrigin(request, environment.APP_BASE_URL))
    return NextResponse.json({ code: "UNTRUSTED_ORIGIN" }, { status: 403 });
  const principal = await getCurrentPrincipal(await headers());
  if (!principal)
    return NextResponse.json(
      { code: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  let documentId = "";
  try {
    const body = requestSchema.parse(await request.json());
    documentId = body.documentId;
    const artifact = await new ExportService(
      getRuntimePool(),
      new FilesystemArtifactStore(environment.ARTIFACT_STORAGE_ROOT),
    ).generate(principal, body);
    return NextResponse.json(
      {
        artifactId: artifact.id,
        classification: artifact.classification,
        filename: artifact.filename,
        downloadUrl: `/api/exports/${artifact.id}`,
        expiresAt: artifact.expires_at.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UnsupportedExportClaimsError)
      return NextResponse.json(
        {
          code: "UNSUPPORTED_CLAIMS",
          claimIds: error.claimIds,
          message:
            "Final PDF and DOCX export requires current approved evidence for every factual claim.",
          remediationUrl: documentId
            ? `/documents/${documentId}#claim-support-heading`
            : "/documents",
        },
        { status: 409 },
      );
    if (error instanceof ExportRateLimitError)
      return NextResponse.json(
        { code: "EXPORT_RATE_LIMIT", message: error.message },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    if (error instanceof ExportNotFoundError)
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
    console.error(
      JSON.stringify({
        event: "export.generate.failed",
        errorCode:
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : "UNCLASSIFIED",
        errorName: error instanceof Error ? error.name : "UnknownError",
        missingFile:
          typeof error === "object" &&
          error !== null &&
          "path" in error &&
          typeof error.path === "string"
            ? error.path.split(/[\\/]/u).at(-1)
            : undefined,
      }),
    );
    return NextResponse.json({ code: "EXPORT_FAILED" }, { status: 500 });
  }
}
