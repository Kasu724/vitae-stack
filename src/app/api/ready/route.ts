import { NextResponse } from "next/server";

import { checkDatabaseReadiness } from "@/infrastructure/database/readiness";
import { getRuntimePool } from "@/infrastructure/database/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const readiness = await checkDatabaseReadiness(getRuntimePool());
    return NextResponse.json(
      {
        status: "ready",
        database: "ready",
        migrations: readiness.migrationCount,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "not-ready",
        database: "unavailable-or-outdated",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
