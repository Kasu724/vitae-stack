"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";

import { MatchingRepository } from "./repository";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function context() {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/sign-in");
  return {
    principal,
    repository: new MatchingRepository(getRuntimePool()),
  };
}

export async function generateEvidenceMatchesAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const jobId = text(form, "jobId");
  try {
    await repository.generate(principal, text(form, "requirementSetId"));
  } catch {
    redirect(`/jobs/${jobId}?error=matching-generate`);
  }
  redirect(`/jobs/${jobId}?notice=matches-generated`);
}

export async function decideEvidenceMatchAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const jobId = text(form, "jobId");
  try {
    const decision = text(form, "decision");
    if (decision !== "included" && decision !== "excluded") throw new Error();
    await repository.decide(principal, text(form, "matchId"), decision);
  } catch {
    redirect(`/jobs/${jobId}?error=matching-decision`);
  }
  redirect(`/jobs/${jobId}?notice=match-updated`);
}
