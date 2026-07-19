"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { formText as text } from "@/modules/shared/form-data";
import { ProviderConfigurationRepository } from "@/modules/providers/repository";
import { ProviderConfigurationService } from "@/modules/providers/service";

import { AtsRepository } from "./repository";
import { AtsAnalysisService } from "./service";

export async function generateAtsReportAction(form: FormData): Promise<void> {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const documentId = text(form, "documentId");
  const sourceId = text(form, "sourceId");
  let result: { reportId: string; source: boolean };
  try {
    const pool = getRuntimePool();
    const providerRepository = new ProviderConfigurationRepository(pool);
    result = await new AtsAnalysisService(
      new AtsRepository(pool),
      providerRepository,
      new ProviderConfigurationService(
        providerRepository,
        readServerEnvironment(),
      ),
    ).generate(principal, {
      ...(sourceId ? { sourceId } : { documentId }),
      jobId: text(form, "jobId"),
      providerConfigurationId: text(form, "providerConfigurationId"),
    });
  } catch {
    redirect(
      `/ats?${sourceId ? `sourceId=${sourceId}` : `documentId=${documentId}`}&error=invalid-input`,
    );
  }
  redirect(
    result.source
      ? `/ats/source-reports/${result.reportId}`
      : `/ats/reports/${result.reportId}`,
  );
}
