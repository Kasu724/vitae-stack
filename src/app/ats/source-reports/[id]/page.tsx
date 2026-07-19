import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { AtsReportContent } from "@/modules/ats/components/report-content";
import { AtsInputNotFoundError, AtsRepository } from "@/modules/ats/repository";
import { getCurrentPrincipal } from "@/modules/auth/principal";

export const dynamic = "force-dynamic";

export default async function SourceAtsReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const { id } = await params;
  let view;
  try {
    view = await new AtsRepository(getRuntimePool()).getSourceReport(
      principal,
      id,
    );
  } catch (error) {
    if (error instanceof AtsInputNotFoundError) notFound();
    throw error;
  }
  const report = view.report;
  return (
    <AtsReportContent
      analyzeHref={`/ats?sourceId=${report.source_document_id}`}
      analyzeLabel="Analyze source again"
      backHref={`/sources/${report.source_document_id}`}
      backLabel={report.source_name}
      categories={view.categories}
      findings={view.findings}
      notice="This AI estimate uses parsed source text. It does not establish claim provenance, control export eligibility, emulate a proprietary ATS, or predict hiring outcomes."
      report={report}
      resumeIdentity={{
        label: "Source checksum",
        value: report.document_hash,
      }}
      subject={report.source_name}
    />
  );
}
