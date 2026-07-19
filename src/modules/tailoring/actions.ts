"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { formText as text } from "@/modules/shared/form-data";
import { ProviderConfigurationRepository } from "@/modules/providers/repository";
import { ProviderConfigurationService } from "@/modules/providers/service";

import { CoverLetterTailoringService } from "./cover-letter-service";
import {
  TailoringRepository,
  TailoringStaleRunError,
  type TailoringReviewDecision,
} from "./repository";
import { ResumeTailoringService } from "./service";

export async function startResumeTailoringAction(
  form: FormData,
): Promise<void> {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const documentId = text(form, "documentId");
  const tone = text(form, "tone");
  const targetLength = text(form, "targetLength");
  let runId: string;
  try {
    const pool = getRuntimePool();
    const providerRepository = new ProviderConfigurationRepository(pool);
    runId = await new ResumeTailoringService(
      new TailoringRepository(pool),
      new ProviderConfigurationService(
        providerRepository,
        readServerEnvironment(),
      ),
    ).start(principal, {
      documentId,
      jobId: text(form, "jobId"),
      selectedEntryIds: form
        .getAll("entryId")
        .filter((value): value is string => typeof value === "string"),
      providerConfigurationId: text(form, "providerConfigurationId"),
      tone: tone === "formal" || tone === "warm" ? tone : "direct",
      targetLength: targetLength === "concise" ? "concise" : "standard",
      idempotencyKey: text(form, "idempotencyKey"),
    });
  } catch {
    redirect(`/tailoring/resume?documentId=${documentId}&error=invalid-setup`);
  }
  redirect(`/tailoring/runs/${runId}`);
}

export async function startCoverLetterTailoringAction(
  form: FormData,
): Promise<void> {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const documentId = text(form, "documentId");
  const tone = text(form, "tone");
  const targetLength = text(form, "targetLength");
  let runId: string;
  try {
    const pool = getRuntimePool();
    const providerRepository = new ProviderConfigurationRepository(pool);
    runId = await new CoverLetterTailoringService(
      new TailoringRepository(pool),
      new ProviderConfigurationService(
        providerRepository,
        readServerEnvironment(),
      ),
    ).start(principal, {
      documentId,
      jobId: text(form, "jobId"),
      selectedEntryIds: form
        .getAll("entryId")
        .filter((value): value is string => typeof value === "string"),
      providerConfigurationId: text(form, "providerConfigurationId"),
      tone: tone === "formal" || tone === "warm" ? tone : "direct",
      targetLength: targetLength === "concise" ? "concise" : "standard",
      idempotencyKey: text(form, "idempotencyKey"),
    });
  } catch {
    redirect(
      `/tailoring/cover-letter?documentId=${documentId}&error=invalid-setup`,
    );
  }
  redirect(`/tailoring/runs/${runId}`);
}

export async function reviewTailoringRunAction(form: FormData): Promise<void> {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const runId = text(form, "runId");
  const documentId = text(form, "documentId");
  const suggestionIds = form
    .getAll("suggestionId")
    .filter((value): value is string => typeof value === "string");
  const decisions: TailoringReviewDecision[] = suggestionIds.map(
    (suggestionId) => {
      const decision = text(form, `decision:${suggestionId}`);
      if (decision !== "accepted" && decision !== "rejected")
        redirect(`/tailoring/runs/${runId}?error=invalid-review`);
      const edited = form.get(`editedText:${suggestionId}`);
      return {
        suggestionId,
        decision,
        editedText: typeof edited === "string" ? edited : "",
      };
    },
  );
  let versionId: string | null;
  try {
    versionId = await new TailoringRepository(getRuntimePool()).reviewRun(
      principal,
      runId,
      decisions,
    );
  } catch (error) {
    if (error instanceof TailoringStaleRunError)
      redirect(`/tailoring/runs/${runId}?error=stale`);
    redirect(`/tailoring/runs/${runId}?error=invalid-review`);
  }
  if (versionId) redirect(`/documents/${documentId}?notice=tailoring-applied`);
  redirect(`/tailoring/runs/${runId}?notice=discarded`);
}
