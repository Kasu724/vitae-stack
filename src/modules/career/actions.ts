"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  archivedValue,
  safeReturnPath,
  selectedIds,
  withNotice,
} from "@/modules/shared/bulk-actions";

import { parseTags } from "./domain";
import {
  parseCareerEntryForm,
  parseFactForm,
  type CareerEntryFormState,
  type FactFormState,
} from "./form-validation";
import {
  CareerConflictError,
  CareerDocumentDependencyError,
  CareerRepository,
} from "./repository";

async function context() {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  return { principal, repository: new CareerRepository(getRuntimePool()) };
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createCareerEntryAction(
  previous: CareerEntryFormState,
  form: FormData,
): Promise<CareerEntryFormState> {
  const { principal, repository } = await context();
  const parsed = parseCareerEntryForm(form);
  if (!parsed.value)
    return {
      fields: parsed.fields,
      errors: parsed.errors,
      message: "Correct the highlighted fields and try again.",
      attempt: previous.attempt + 1,
    };
  const id = await repository.createEntry(principal, parsed.value);
  redirect(`/career/${id}?notice=created`);
}

export async function updateCareerEntryAction(
  previous: CareerEntryFormState,
  form: FormData,
): Promise<CareerEntryFormState> {
  const { principal, repository } = await context();
  const id = text(form, "id");
  const parsed = parseCareerEntryForm(form);
  const revision = Number(text(form, "revision"));
  if (!parsed.value || !Number.isInteger(revision) || revision <= 0)
    return {
      fields: parsed.fields,
      errors: parsed.errors,
      message: "Correct the highlighted fields and try again.",
      attempt: previous.attempt + 1,
    };
  try {
    await repository.updateEntry(principal, id, revision, parsed.value);
  } catch (error) {
    if (error instanceof CareerConflictError)
      return {
        fields: parsed.fields,
        errors: {},
        message:
          "This entry changed in another view. Your values are preserved here; reload and reapply them to the current revision.",
        attempt: previous.attempt + 1,
      };
    throw error;
  }
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

export async function updateCareerEntriesStatusAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const ids = selectedIds(form);
  const archived = archivedValue(form);
  await repository.setArchivedMany(principal, ids, archived);
  redirect(
    withNotice(
      safeReturnPath(form, "/career", "/career"),
      archived ? "archived" : "restored",
    ),
  );
}

export async function createFactProposalAction(
  previous: FactFormState,
  form: FormData,
): Promise<FactFormState> {
  const { principal, repository } = await context();
  const entryId = text(form, "entryId");
  const parsed = parseFactForm(form);
  if (!parsed.value)
    return {
      fields: parsed.fields,
      errors: parsed.errors,
      message: "Correct the highlighted fact fields and try again.",
      attempt: previous.attempt + 1,
    };
  await repository.createProposal(principal, entryId, parsed.value);
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

export async function supersedeFactAction(
  previous: FactFormState,
  form: FormData,
): Promise<FactFormState> {
  const { principal, repository } = await context();
  const entryId = text(form, "entryId");
  const parsed = parseFactForm(form);
  if (!parsed.value)
    return {
      fields: parsed.fields,
      errors: parsed.errors,
      message: "Correct the highlighted fact fields and try again.",
      attempt: previous.attempt + 1,
    };
  try {
    await repository.supersedeFact(
      principal,
      text(form, "factId"),
      parsed.value,
    );
  } catch (error) {
    if (error instanceof CareerConflictError)
      return {
        fields: parsed.fields,
        errors: {},
        message:
          "This fact changed before the correction was saved. Your values are preserved; reload and review the current fact.",
        attempt: previous.attempt + 1,
      };
    throw error;
  }
  redirect(`/career/${entryId}?notice=fact-corrected`);
}

export async function withdrawFactAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  await repository.withdrawFact(principal, text(form, "factId"));
  redirect(`/career/${text(form, "entryId")}?notice=fact-withdrawn`);
}

export async function deleteCareerEntryAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const entryId = text(form, "id");
  if (text(form, "confirmation") !== "DELETE") {
    redirect(`/career/${entryId}?error=confirmation`);
  }
  try {
    await repository.deleteEntry(principal, entryId);
  } catch (error) {
    if (error instanceof CareerDocumentDependencyError)
      redirect(`/career/${entryId}?error=document-dependency`);
    throw error;
  }
  redirect("/career?notice=deleted");
}

export async function deleteCareerEntriesAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const ids = selectedIds(form);
  const returnPath = safeReturnPath(form, "/career", "/career");
  const previews = await Promise.all(
    ids.map((id) => repository.dependencyPreview(principal, id)),
  );
  if (previews.some((preview) => preview.documentClaims > 0))
    redirect(withNotice(returnPath, "delete-blocked"));
  for (const id of ids) await repository.deleteEntry(principal, id);
  redirect(withNotice(returnPath, "deleted"));
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
