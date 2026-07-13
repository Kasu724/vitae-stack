"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { partialDateSchema } from "@/modules/career/domain";
import { SourceRepository } from "@/modules/ingestion/source-repository";
import { ProviderConfigurationRepository } from "@/modules/providers/repository";
import { ProviderConfigurationService } from "@/modules/providers/service";

import { extractionProposalEditSchema } from "./domain";
import { ExtractionRepository } from "./repository";
import { ExtractionAnalysisService } from "./service";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function reviewLocation(
  batchId: string,
  form: FormData,
  kind: "error" | "notice",
  value: string,
): string {
  const parameters = new URLSearchParams({ [kind]: value });
  const page = text(form, "page");
  if (/^[1-9][0-9]*$/u.test(page)) parameters.set("page", page);
  return `/extractions/${batchId}?${parameters.toString()}`;
}

async function context() {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  return { principal, repository: new ExtractionRepository(getRuntimePool()) };
}

function proposedValue(form: FormData) {
  const type = text(form, "factType");
  const displayText = text(form, "displayText");
  if (type === "metric") {
    return {
      type,
      displayText,
      value: {
        kind: "metric" as const,
        value: Number(text(form, "metricValue")),
        unit: text(form, "metricUnit"),
        context: text(form, "metricContext"),
      },
    };
  }
  if (type === "date") {
    const value = partialDateSchema.parse(displayText);
    return {
      type,
      displayText,
      value: {
        kind: "date" as const,
        value,
        precision:
          value.length === 4
            ? ("year" as const)
            : value.length === 7
              ? ("month" as const)
              : ("day" as const),
      },
    };
  }
  if (type === "skill") {
    return {
      type,
      displayText,
      value: { kind: "skill" as const, name: displayText },
    };
  }
  return {
    type,
    displayText,
    value: { kind: "text" as const, text: displayText },
  };
}

export async function startExtractionAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const sourceId = text(form, "sourceId");
  let batchId: string;
  try {
    batchId = await repository.createDeterministicBatch(principal, sourceId);
  } catch {
    redirect(`/sources/${sourceId}?error=extraction`);
  }
  redirect(`/extractions/${batchId}`);
}

export async function startAiExtractionAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const sourceId = text(form, "sourceId");
  const providerConfigurationId = text(form, "providerConfigurationId");
  let batchId: string;
  try {
    const pool = getRuntimePool();
    batchId = await new ExtractionAnalysisService(
      repository,
      new SourceRepository(pool),
      new ProviderConfigurationService(
        new ProviderConfigurationRepository(pool),
        readServerEnvironment(),
      ),
    ).createAiBatch(principal, { sourceId, providerConfigurationId });
  } catch {
    redirect(`/sources/${sourceId}?error=ai-extraction`);
  }
  redirect(`/extractions/${batchId}`);
}

export async function updateExtractionProposalAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const batchId = text(form, "batchId");
  try {
    const edit = extractionProposalEditSchema.parse({
      entryType: text(form, "entryType"),
      entryTitle: text(form, "entryTitle"),
      targetCareerEntryId: text(form, "targetCareerEntryId") || null,
      fact: proposedValue(form),
    });
    await repository.updateProposal(
      principal,
      text(form, "proposalId"),
      Number(text(form, "revision")),
      edit,
    );
  } catch {
    redirect(reviewLocation(batchId, form, "error", "proposal-update"));
  }
  redirect(reviewLocation(batchId, form, "notice", "proposal-updated"));
}

export async function approveExtractionProposalAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const batchId = text(form, "batchId");
  try {
    await repository.approve(principal, text(form, "proposalId"));
  } catch {
    redirect(reviewLocation(batchId, form, "error", "proposal-resolution"));
  }
  redirect(reviewLocation(batchId, form, "notice", "proposal-approved"));
}

export async function rejectExtractionProposalAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const batchId = text(form, "batchId");
  try {
    await repository.reject(principal, text(form, "proposalId"));
  } catch {
    redirect(reviewLocation(batchId, form, "error", "proposal-resolution"));
  }
  redirect(reviewLocation(batchId, form, "notice", "proposal-rejected"));
}

export async function mergeExtractionProposalAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const batchId = text(form, "batchId");
  try {
    await repository.mergeDuplicate(principal, text(form, "proposalId"));
  } catch {
    redirect(reviewLocation(batchId, form, "error", "proposal-resolution"));
  }
  redirect(reviewLocation(batchId, form, "notice", "proposal-merged"));
}

export async function bulkApproveExtractionAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const batchId = text(form, "batchId");
  try {
    const selected = form
      .getAll("proposalId")
      .filter((value): value is string => typeof value === "string");
    await repository.bulkApprove(
      principal,
      selected,
      Number(text(form, "confirmedCount")),
    );
  } catch {
    redirect(reviewLocation(batchId, form, "error", "bulk-confirmation"));
  }
  redirect(reviewLocation(batchId, form, "notice", "bulk-approved"));
}
