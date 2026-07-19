"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { formText as text } from "@/modules/shared/form-data";

import {
  providerDeletionInputSchema,
  taskAssignmentsInputSchema,
  taskAssignmentRemovalInputSchema,
} from "./domain";
import {
  ProviderConfigurationInUseError,
  ProviderConfigurationRepository,
} from "./repository";
import {
  providerCapabilityTestFailure,
  ProviderConfigurationService,
} from "./service";
import { taskRegistry } from "./task-registry";

async function context() {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
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
    const selectedTaskIds = form
      .getAll("taskIds")
      .filter((value): value is string => typeof value === "string");
    const taskIds =
      text(form, "assignmentScope") === "all"
        ? [...taskRegistry.keys()]
        : selectedTaskIds;
    const input = taskAssignmentsInputSchema.parse({
      taskIds,
      model: text(form, "model"),
      expectedRevision: Number(text(form, "expectedRevision")),
    });
    await repository.assignTasks(
      principal,
      id,
      input.taskIds,
      input.model,
      input.expectedRevision,
    );
  } catch {
    redirect("/settings/providers?error=assign");
  }
  redirect("/settings/providers?notice=assigned");
}

export async function unassignProviderTaskAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  try {
    const input = taskAssignmentRemovalInputSchema.parse({
      taskId: text(form, "taskId"),
      expectedRevision: Number(text(form, "expectedRevision")),
    });
    await repository.unassignTask(
      principal,
      text(form, "configurationId"),
      input.taskId,
      input.expectedRevision,
    );
  } catch {
    redirect("/settings/providers?error=unassign");
  }
  redirect("/settings/providers?notice=unassigned");
}

export async function deleteProviderAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  try {
    const input = providerDeletionInputSchema.parse({
      configurationId: text(form, "configurationId"),
      expectedRevision: Number(text(form, "expectedRevision")),
    });
    await repository.delete(
      principal,
      input.configurationId,
      input.expectedRevision,
    );
  } catch (error) {
    if (error instanceof ProviderConfigurationInUseError)
      redirect("/settings/providers?error=delete-in-use");
    redirect("/settings/providers?error=delete");
  }
  redirect("/settings/providers?notice=deleted");
}

export async function testProviderAction(form: FormData): Promise<void> {
  const { principal, service } = await context();
  const id = text(form, "configurationId");
  let result: Awaited<ReturnType<typeof service.testCapability>> = {
    available: false,
    failure: "unknown",
  };
  try {
    result = await service.testCapability(principal, id, text(form, "model"));
  } catch (error) {
    // This only controls a safe UI diagnostic; no provider response is exposed.
    result = {
      available: false,
      failure: providerCapabilityTestFailure(error),
    };
  }
  redirect(
    `/settings/providers?${
      result.available
        ? "notice=available"
        : `error=provider-${result.failure}${result.httpStatus !== undefined ? `-${result.httpStatus}` : ""}`
    }`,
  );
}
