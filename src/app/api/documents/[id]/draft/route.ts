import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { readServerEnvironment } from "@/infrastructure/config/environment";
import { isTrustedRequestOrigin } from "@/modules/auth/auth-request-handler";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { canonicalDocumentSchema } from "@/modules/documents/document-schema";
import { draftConflictResponseSchema } from "@/modules/documents/draft-contract";
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
  if (!isTrustedRequestOrigin(request, environment.APP_BASE_URL))
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
  const repository = new DocumentRepository(getRuntimePool());
  try {
    const draft = await repository.saveDraft(principal, {
      documentId: (await params).id,
      ...parsed.data,
    });
    return NextResponse.json({
      revision: draft.revision,
      updatedAt: draft.updated_at.toISOString(),
    });
  } catch (error) {
    if (error instanceof DocumentConflictError) {
      const document = await repository.get(principal, (await params).id);
      const currentDraft =
        document.draft?.base_version_id === document.currentVersion.id
          ? document.draft
          : null;
      const response = draftConflictResponseSchema.parse({
        code: "DRAFT_CONFLICT",
        server: currentDraft
          ? {
              baseVersionId: currentDraft.base_version_id,
              revision: currentDraft.revision,
              content: currentDraft.content,
              updatedAt: currentDraft.updated_at.toISOString(),
              source: "draft",
            }
          : {
              baseVersionId: document.currentVersion.id,
              revision: 0,
              content: document.currentVersion.content,
              updatedAt: document.currentVersion.created_at.toISOString(),
              source: "current_version",
            },
      });
      return NextResponse.json(response, {
        status: 409,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (error instanceof DocumentNotFoundError)
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    throw error;
  }
}
