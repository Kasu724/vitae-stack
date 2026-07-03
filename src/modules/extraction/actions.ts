"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { partialDateSchema } from "@/modules/career/domain";

import { extractionProposalEditSchema } from "./domain";
import { ExtractionRepository } from "./repository";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
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
    redirect(`/extractions/${batchId}?error=proposal-update`);
  }
  redirect(`/extractions/${batchId}?notice=proposal-updated`);
}

export async function approveExtractionProposalAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const batchId = text(form, "batchId");
  try {
    await repository.approve(principal, text(form, "proposalId"));
  } catch {
    redirect(`/extractions/${batchId}?error=proposal-resolution`);
  }
  redirect(`/extractions/${batchId}?notice=proposal-approved`);
}

export async function rejectExtractionProposalAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const batchId = text(form, "batchId");
  try {
    await repository.reject(principal, text(form, "proposalId"));
  } catch {
    redirect(`/extractions/${batchId}?error=proposal-resolution`);
  }
  redirect(`/extractions/${batchId}?notice=proposal-rejected`);
}

export async function mergeExtractionProposalAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const batchId = text(form, "batchId");
  try {
    await repository.mergeDuplicate(principal, text(form, "proposalId"));
  } catch {
    redirect(`/extractions/${batchId}?error=proposal-resolution`);
  }
  redirect(`/extractions/${batchId}?notice=proposal-merged`);
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
    redirect(`/extractions/${batchId}?error=bulk-confirmation`);
  }
  redirect(`/extractions/${batchId}?notice=bulk-approved`);
}
