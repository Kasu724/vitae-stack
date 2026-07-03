import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { FilesystemArtifactStore } from "@/infrastructure/artifacts/filesystem-store";
import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { ExportNotFoundError, ExportService } from "@/modules/exports/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal)
    return NextResponse.json(
      { code: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  try {
    const { id } = await params;
    const { artifact, bytes } = await new ExportService(
      getRuntimePool(),
      new FilesystemArtifactStore(
        readServerEnvironment().ARTIFACT_STORAGE_ROOT,
      ),
    ).getArtifact(principal, id);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${artifact.filename}"`,
        "Content-Length": String(bytes.length),
        "Content-Security-Policy": "sandbox",
        "Content-Type": artifact.media_type,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ExportNotFoundError)
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ code: "EXPORT_UNAVAILABLE" }, { status: 500 });
  }
}
