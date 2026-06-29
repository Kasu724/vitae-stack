import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { UnsafeUploadError } from "@/modules/ingestion/file-validation";
import { SourceRepository } from "@/modules/ingestion/source-repository";
import { SourceService } from "@/modules/ingestion/source-service";

const purposeSchema = z.enum([
  "resume",
  "cover_letter",
  "job_description",
  "career_evidence",
  "project_import",
]);

export async function POST(request: NextRequest) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal)
    return NextResponse.redirect(new URL("/sign-in", request.url), 303);
  try {
    const form = await request.formData();
    const file = form.get("file");
    const purpose = purposeSchema.parse(form.get("purpose"));
    if (!(file instanceof File)) throw new UnsafeUploadError("FILE_REQUIRED");
    const id = await new SourceService(
      new SourceRepository(getRuntimePool()),
      readServerEnvironment(),
    ).upload(principal, {
      purpose,
      filename: file.name,
      declaredMediaType: file.type || "application/octet-stream",
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.redirect(new URL(`/sources/${id}`, request.url), 303);
  } catch (error) {
    const code =
      error instanceof UnsafeUploadError ? error.code : "UPLOAD_FAILED";
    return NextResponse.redirect(
      new URL(`/sources?error=${encodeURIComponent(code)}`, request.url),
      303,
    );
  }
}
