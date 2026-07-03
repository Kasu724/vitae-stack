import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { isTrustedRequestOrigin } from "@/modules/auth/auth-request-handler";
import { UnsafeUploadError } from "@/modules/ingestion/file-validation";
import { readBoundedMultipartUpload } from "@/modules/ingestion/multipart-upload";
import {
  SourceRateLimitError,
  SourceRepository,
} from "@/modules/ingestion/source-repository";
import { SourceService } from "@/modules/ingestion/source-service";

const purposeSchema = z.enum([
  "resume",
  "cover_letter",
  "job_description",
  "career_evidence",
  "project_import",
]);

export async function POST(request: NextRequest) {
  const environment = readServerEnvironment();
  if (!isTrustedRequestOrigin(request, environment.APP_BASE_URL))
    return NextResponse.json({ code: "UNTRUSTED_ORIGIN" }, { status: 403 });
  const principal = await getCurrentPrincipal(await headers());
  if (!principal)
    return NextResponse.redirect(new URL("/", environment.APP_BASE_URL), 303);
  try {
    const upload = await readBoundedMultipartUpload(
      request,
      environment.UPLOAD_MAX_BYTES,
    );
    const purpose = purposeSchema.parse(upload.purpose);
    const id = await new SourceService(
      new SourceRepository(getRuntimePool()),
      environment,
    ).upload(principal, {
      purpose,
      filename: upload.filename,
      declaredMediaType: upload.mediaType || "application/octet-stream",
      bytes: upload.bytes,
    });
    return NextResponse.redirect(
      new URL(`/sources/${id}`, environment.APP_BASE_URL),
      303,
    );
  } catch (error) {
    const code =
      error instanceof UnsafeUploadError
        ? error.code
        : error instanceof SourceRateLimitError
          ? "UPLOAD_RATE_LIMIT"
          : "UPLOAD_FAILED";
    return NextResponse.redirect(
      new URL(
        `/sources?error=${encodeURIComponent(code)}`,
        environment.APP_BASE_URL,
      ),
      303,
    );
  }
}
