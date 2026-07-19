"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { formText as text } from "@/modules/shared/form-data";
import { readServerEnvironment } from "@/infrastructure/config/environment";
import { JobUrlImportService } from "@/modules/job-fetch/service";
import {
  JobUrlImportRepository,
  JobUrlRateLimitError,
} from "@/modules/job-fetch/repository";
import {
  archivedValue,
  safeReturnPath,
  selectedIds,
  withNotice,
} from "@/modules/shared/bulk-actions";

import {
  JobDocumentDependencyError,
  JobNotFoundError,
  JobRepository,
} from "./repository";

async function context() {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  return { principal, repository: new JobRepository(getRuntimePool()) };
}

export async function createPastedJobAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  let id: string;
  try {
    id = await repository.createFromText(principal, {
      title: text(form, "title"),
      company: text(form, "company"),
      text: text(form, "jobText"),
      idempotencyKey: text(form, "idempotencyKey"),
    });
  } catch {
    redirect("/jobs?error=invalid-text");
  }
  redirect(`/jobs/${id}?notice=created`);
}

export async function createUrlJobAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  let importId: string;
  try {
    importId = await new JobUrlImportService(
      new JobUrlImportRepository(getRuntimePool()),
      repository,
      readServerEnvironment(),
    ).start(principal, {
      title: text(form, "title"),
      company: text(form, "company"),
      url: text(form, "jobUrl"),
      idempotencyKey: text(form, "idempotencyKey"),
    });
  } catch (error) {
    redirect(
      `/jobs?error=${error instanceof JobUrlRateLimitError ? "url-rate" : "url-blocked"}`,
    );
  }
  redirect(`/job-imports/${importId}`);
}

export async function createJobFromSourceAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const sourceId = text(form, "sourceId");
  let id: string;
  try {
    id = await repository.createFromSource(principal, sourceId, {
      title: text(form, "title"),
      company: text(form, "company"),
    });
  } catch {
    redirect(`/sources/${sourceId}?error=job-snapshot`);
  }
  redirect(`/jobs/${id}?notice=created-from-file`);
}

export async function reviseJobAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const id = text(form, "jobId");
  try {
    await repository.revise(
      principal,
      id,
      text(form, "currentRevisionId"),
      text(form, "jobText"),
    );
  } catch {
    redirect(`/jobs/${id}?error=revision-conflict`);
  }
  redirect(`/jobs/${id}?notice=revised`);
}

export async function archiveJobAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const id = text(form, "jobId");
  await repository.setArchived(
    principal,
    id,
    text(form, "archived") === "true",
  );
  redirect(`/jobs/${id}?notice=status-updated`);
}

export async function updateJobsStatusAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const ids = selectedIds(form);
  const archived = archivedValue(form);
  await repository.setArchivedMany(principal, ids, archived);
  redirect(
    withNotice(
      safeReturnPath(form, "/jobs", "/jobs"),
      archived ? "archived" : "restored",
    ),
  );
}

export async function deleteJobsAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const ids = selectedIds(form);
  const returnPath = safeReturnPath(form, "/jobs", "/jobs");
  try {
    await repository.deleteMany(principal, ids);
  } catch (error) {
    if (error instanceof JobDocumentDependencyError)
      redirect(withNotice(returnPath, "delete-blocked"));
    if (error instanceof JobNotFoundError)
      redirect(withNotice(returnPath, "delete-unavailable"));
    throw error;
  }
  redirect(withNotice(returnPath, "deleted"));
}
