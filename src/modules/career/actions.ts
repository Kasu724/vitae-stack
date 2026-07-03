"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";

import {
  careerEntryInputSchema,
  factProposalInputSchema,
  parseTags,
  partialDateSchema,
} from "./domain";
import { CareerRepository } from "./repository";

async function context() {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  return { principal, repository: new CareerRepository(getRuntimePool()) };
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function entryInput(form: FormData) {
  return careerEntryInputSchema.parse({
    type: text(form, "type"),
    title: text(form, "title"),
    organization: text(form, "organization"),
    location: text(form, "location"),
    description: text(form, "description"),
    startDate: text(form, "startDate"),
    endDate: text(form, "endDate"),
    isCurrent: form.get("isCurrent") === "on",
    tags: parseTags(text(form, "tags")),
  });
}

function proposalInput(form: FormData) {
  const type = text(form, "factType");
  const displayText = text(form, "displayText");
  let value: unknown = { kind: "text", text: displayText };
  if (type === "metric") {
    value = {
      kind: "metric",
      value: Number(text(form, "metricValue")),
      unit: text(form, "metricUnit"),
      context: text(form, "metricContext"),
    };
  } else if (type === "skill") {
    value = { kind: "skill", name: displayText };
  } else if (type === "date") {
    const date = partialDateSchema.parse(displayText);
    value = {
      kind: "date",
      value: date,
      precision:
        date.length === 4 ? "year" : date.length === 7 ? "month" : "day",
    };
  }
  return factProposalInputSchema.parse({
    type,
    value,
    displayText,
    sourceLocator: { kind: "manual", label: "Manual entry" },
  });
}

export async function createCareerEntryAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const id = await repository.createEntry(principal, entryInput(form));
  redirect(`/career/${id}?notice=created`);
}

export async function updateCareerEntryAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const id = text(form, "id");
  await repository.updateEntry(
    principal,
    id,
    Number(text(form, "revision")),
    entryInput(form),
  );
  redirect(`/career/${id}?notice=updated`);
}

export async function setCareerEntryArchivedAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const id = text(form, "id");
  await repository.setArchived(
    principal,
    id,
    text(form, "archived") === "true",
  );
  redirect(`/career/${id}?notice=status-updated`);
}

export async function createFactProposalAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const entryId = text(form, "entryId");
  await repository.createProposal(principal, entryId, proposalInput(form));
  redirect(`/career/${entryId}?notice=proposal-created`);
}

export async function approveFactProposalAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  await repository.approveProposal(principal, text(form, "proposalId"));
  redirect(`/career/${text(form, "entryId")}?notice=fact-approved`);
}

export async function rejectFactProposalAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  await repository.rejectProposal(principal, text(form, "proposalId"));
  redirect(`/career/${text(form, "entryId")}?notice=proposal-rejected`);
}

export async function supersedeFactAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  await repository.supersedeFact(
    principal,
    text(form, "factId"),
    proposalInput(form),
  );
  redirect(`/career/${text(form, "entryId")}?notice=fact-corrected`);
}

export async function withdrawFactAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  await repository.withdrawFact(principal, text(form, "factId"));
  redirect(`/career/${text(form, "entryId")}?notice=fact-withdrawn`);
}

export async function deleteCareerEntryAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  if (text(form, "confirmation") !== "DELETE") {
    redirect(`/career/${text(form, "id")}?error=confirmation`);
  }
  await repository.deleteEntry(principal, text(form, "id"));
  redirect("/career?notice=deleted");
}

export async function createSkillAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  await repository.createSkill(principal, {
    displayName: text(form, "displayName"),
    category: text(form, "category"),
    aliases: parseTags(text(form, "aliases")),
  });
  redirect("/career?notice=skill-saved");
}

export async function linkSkillAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const entryId = text(form, "entryId");
  const rawProficiency = text(form, "proficiency");
  const proficiency = ["familiar", "working", "advanced", "expert"].includes(
    rawProficiency,
  )
    ? (rawProficiency as "familiar" | "working" | "advanced" | "expert")
    : null;
  await repository.linkSkill(
    principal,
    entryId,
    text(form, "skillId"),
    proficiency,
  );
  redirect(`/career/${entryId}?notice=skill-linked`);
}

export async function updateCareerSettingsAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const tone = text(form, "tone");
  await repository.updateProfileSettings(principal, {
    careerGoals: text(form, "careerGoals").split("\n"),
    targetRoles: text(form, "targetRoles").split("\n"),
    tone: tone === "formal" || tone === "warm" ? tone : "direct",
  });
  redirect("/career?notice=settings-saved");
}
