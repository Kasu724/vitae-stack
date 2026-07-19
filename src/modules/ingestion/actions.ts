"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  safeReturnPath,
  selectedIds,
  withNotice,
} from "@/modules/shared/bulk-actions";

import { SourceRepository } from "./source-repository";
import { SourceService } from "./source-service";

export async function deleteSourceAction(form: FormData): Promise<void> {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const id = form.get("sourceId");
  if (typeof id !== "string") redirect("/sources");
  if (form.get("confirmation") !== "DELETE")
    redirect(`/sources/${id}?error=confirmation`);
  await new SourceService(
    new SourceRepository(getRuntimePool()),
    readServerEnvironment(),
  ).deleteBinaryAndRecord(principal, id);
  redirect("/sources?notice=deleted");
}

export async function deleteSourcesAction(form: FormData): Promise<void> {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const returnPath = safeReturnPath(form, "/sources", "/sources");
  const repository = new SourceRepository(getRuntimePool());
  const service = new SourceService(repository, readServerEnvironment());
  const ids = selectedIds(form);
  await service.deleteBinariesAndRecords(principal, ids);
  redirect(withNotice(returnPath, "deleted"));
}
