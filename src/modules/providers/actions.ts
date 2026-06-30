"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";

import { taskAssignmentInputSchema } from "./domain";
import { ProviderConfigurationRepository } from "./repository";
import { ProviderConfigurationService } from "./service";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function context() {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/sign-in");
  const repository = new ProviderConfigurationRepository(getRuntimePool());
  return {
    principal,
    repository,
    service: new ProviderConfigurationService(
      repository,
      readServerEnvironment(),
    ),
  };
}

export async function createProviderAction(form: FormData): Promise<void> {
  const { principal, service } = await context();
  try {
    await service.create(principal, {
      label: text(form, "label"),
      kind: text(form, "kind"),
      baseUrl: text(form, "baseUrl"),
      authType: text(form, "authType"),
      credential: text(form, "credential") || undefined,
      environmentVariableName:
        text(form, "environmentVariableName") || undefined,
    });
  } catch {
    redirect("/settings/providers?error=create");
  }
  redirect("/settings/providers?notice=created");
}

export async function rotateProviderCredentialAction(
  form: FormData,
): Promise<void> {
  const { principal, service } = await context();
  const id = text(form, "configurationId");
  try {
    await service.rotateCredential(
      principal,
      id,
      text(form, "credential"),
      Number(text(form, "expectedRevision")),
    );
  } catch {
    redirect("/settings/providers?error=rotate");
  }
  redirect("/settings/providers?notice=rotated");
}

export async function assignProviderTaskAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const id = text(form, "configurationId");
  try {
    const input = taskAssignmentInputSchema.parse({
      taskId: text(form, "taskId"),
      model: text(form, "model"),
      expectedRevision: Number(text(form, "expectedRevision")),
    });
    await repository.assignTask(
      principal,
      id,
      input.taskId,
      input.model,
      input.expectedRevision,
    );
  } catch {
    redirect("/settings/providers?error=assign");
  }
  redirect("/settings/providers?notice=assigned");
}

export async function testProviderAction(form: FormData): Promise<void> {
  const { principal, service } = await context();
  const id = text(form, "configurationId");
  let available = false;
  try {
    available = await service.testCapability(
      principal,
      id,
      text(form, "model"),
    );
  } catch {
    available = false;
  }
  redirect(
    `/settings/providers?${available ? "notice=available" : "error=unavailable"}`,
  );
}
