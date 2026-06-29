import { NextResponse } from "next/server";

import { readServerEnvironment } from "@/infrastructure/config/environment";

export const dynamic = "force-dynamic";

export function GET() {
  const environment = readServerEnvironment();

  return NextResponse.json(
    {
      status: "ok",
      service: "vitae-stack",
      environment: environment.NODE_ENV,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
