import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { readServerEnvironment } from "@/infrastructure/config/environment";
import { isTrustedRequestOrigin } from "@/modules/auth/auth-request-handler";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { canonicalDocumentSchema } from "@/modules/documents/document-schema";
import {
  DocumentConflictError,
  DocumentNotFoundError,
  DocumentRepository,
} from "@/modules/documents/repository";

const requestSchema = z.object({
  baseVersionId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  content: canonicalDocumentSchema,
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const environment = readServerEnvironment();
  if (!isTrustedRequestOrigin(request, environment.BETTER_AUTH_URL))
    return NextResponse.json({ code: "UNTRUSTED_ORIGIN" }, { status: 403 });
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 1024 * 1024)
    return NextResponse.json({ code: "DOCUMENT_TOO_LARGE" }, { status: 413 });
  const principal = await getCurrentPrincipal(await headers());
  if (!principal)
    return NextResponse.json(
      { code: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ code: "INVALID_DOCUMENT" }, { status: 400 });
  try {
    const draft = await new DocumentRepository(getRuntimePool()).saveDraft(
      principal,
      {
        documentId: (await params).id,
        ...parsed.data,
      },
    );
    return NextResponse.json({
      revision: draft.revision,
      updatedAt: draft.updated_at.toISOString(),
    });
  } catch (error) {
    if (error instanceof DocumentConflictError)
      return NextResponse.json({ code: "DRAFT_CONFLICT" }, { status: 409 });
    if (error instanceof DocumentNotFoundError)
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    throw error;
  }
}
