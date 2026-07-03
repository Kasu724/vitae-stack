"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";

import { AtsRepository } from "./repository";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function generateAtsReportAction(form: FormData): Promise<void> {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const documentId = text(form, "documentId");
  let reportId: string;
  try {
    reportId = await new AtsRepository(getRuntimePool()).generate(principal, {
      documentId,
      jobId: text(form, "jobId"),
    });
  } catch {
    redirect(`/ats?documentId=${documentId}&error=invalid-input`);
  }
  redirect(`/ats/reports/${reportId}`);
}
