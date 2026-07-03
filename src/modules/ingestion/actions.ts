"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";

import { SourceDependencyError, SourceRepository } from "./source-repository";
import { SourceService } from "./source-service";

export async function deleteSourceAction(form: FormData): Promise<void> {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const id = form.get("sourceId");
  if (typeof id !== "string") redirect("/sources");
  if (form.get("confirmation") !== "DELETE")
    redirect(`/sources/${id}?error=confirmation`);
  try {
    await new SourceService(
      new SourceRepository(getRuntimePool()),
      readServerEnvironment(),
    ).deleteBinaryAndRecord(principal, id);
  } catch (error) {
    if (error instanceof SourceDependencyError)
      redirect(`/sources/${id}?error=pending-extraction`);
    throw error;
  }
  redirect("/sources?notice=deleted");
}
