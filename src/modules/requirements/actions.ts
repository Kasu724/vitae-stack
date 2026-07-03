"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { JobRepository } from "@/modules/jobs/repository";
import { ProviderConfigurationRepository } from "@/modules/providers/repository";
import { ProviderConfigurationService } from "@/modules/providers/service";

import { RequirementRepository } from "./repository";
import { RequirementAnalysisService } from "./service";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function context() {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const pool = getRuntimePool();
  const repository = new RequirementRepository(pool);
  const providers = new ProviderConfigurationService(
    new ProviderConfigurationRepository(pool),
    readServerEnvironment(),
  );
  return {
    principal,
    repository,
    jobs: new JobRepository(pool),
    service: new RequirementAnalysisService(repository, providers),
  };
}

async function currentJob(form: FormData) {
  const state = await context();
  const jobId = text(form, "jobId");
  const job = await state.jobs.get(state.principal, jobId);
  return { ...state, jobId, current: job.revisions[0]! };
}

export async function startRequirementAnalysisAction(
  form: FormData,
): Promise<void> {
  let jobId = text(form, "jobId");
  try {
    const state = await currentJob(form);
    jobId = state.jobId;
    const method = text(form, "method");
    if (method === "ai")
      await state.service.createAiDraft(state.principal, {
        jobRevisionId: state.current.id,
        snapshot: state.current.normalized_text,
        providerConfigurationId: text(form, "providerConfigurationId"),
      });
    else if (method === "manual")
      await state.service.createManualDraft(
        state.principal,
        state.current.id,
        state.current.normalized_text,
      );
    else
      await state.service.createDeterministicDraft(
        state.principal,
        state.current.id,
        state.current.normalized_text,
      );
  } catch {
    redirect(`/jobs/${jobId}?error=requirement-analysis`);
  }
  redirect(`/jobs/${jobId}?notice=requirement-draft`);
}

export async function reviseRequirementAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const jobId = text(form, "jobId");
  try {
    await repository.reviseRequirement(principal, {
      setId: text(form, "setId"),
      requirementId: text(form, "requirementId"),
      category: text(form, "category"),
      priority: text(form, "priority"),
      decision: text(form, "decision"),
      requirementText: text(form, "requirementText"),
    });
  } catch {
    redirect(`/jobs/${jobId}?error=requirement-conflict`);
  }
  redirect(`/jobs/${jobId}?notice=requirement-updated`);
}

export async function addManualRequirementAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const jobId = text(form, "jobId");
  try {
    await repository.addManualRequirement(principal, text(form, "setId"), {
      category: text(form, "category"),
      priority: text(form, "priority"),
      requirementText: text(form, "requirementText"),
    });
  } catch {
    redirect(`/jobs/${jobId}?error=requirement-conflict`);
  }
  redirect(`/jobs/${jobId}?notice=requirement-updated`);
}

export async function finalizeRequirementsAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const jobId = text(form, "jobId");
  try {
    await repository.finalize(principal, text(form, "setId"));
  } catch {
    redirect(`/jobs/${jobId}?error=requirement-finalize`);
  }
  redirect(`/jobs/${jobId}?notice=requirement-finalized`);
}

export async function correctRequirementsAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const jobId = text(form, "jobId");
  try {
    await repository.createCorrectionDraft(principal, text(form, "setId"));
  } catch {
    redirect(`/jobs/${jobId}?error=requirement-conflict`);
  }
  redirect(`/jobs/${jobId}?notice=requirement-correction`);
}
