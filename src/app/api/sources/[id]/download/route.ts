import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { FilesystemArtifactStore } from "@/infrastructure/artifacts/filesystem-store";
import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  SourceNotFoundError,
  SourceRepository,
} from "@/modules/ingestion/source-repository";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal)
    return NextResponse.json(
      { code: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  try {
    const source = await new SourceRepository(getRuntimePool()).get(
      principal,
      (await params).id,
    );
    if (source.status !== "ready")
      return NextResponse.json({ code: "SOURCE_UNAVAILABLE" }, { status: 409 });
    const bytes = await new FilesystemArtifactStore(
      readServerEnvironment().ARTIFACT_STORAGE_ROOT,
    ).read(source.storage_key);
    const encodedName = encodeURIComponent(source.original_name).replaceAll(
      "'",
      "%27",
    );
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="source-document"; filename*=UTF-8''${encodedName}`,
        "content-type": source.detected_media_type,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof SourceNotFoundError)
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    throw error;
  }
}
