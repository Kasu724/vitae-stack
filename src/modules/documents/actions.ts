"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FilesystemArtifactStore } from "@/infrastructure/artifacts/filesystem-store";
import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { formText as text } from "@/modules/shared/form-data";
import { CareerRepository } from "@/modules/career/repository";
import {
  archivedValue,
  safeReturnPath,
  selectedIds,
  withNotice,
} from "@/modules/shared/bulk-actions";

import { canonicalDocumentSchema, documentKindSchema } from "./document-schema";
import {
  DocumentConflictError,
  DocumentDependencyError,
  DocumentNotFoundError,
  DocumentRepository,
} from "./repository";

async function context() {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  return { principal, repository: new DocumentRepository(getRuntimePool()) };
}

export async function createDocumentAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const id = await repository.create(principal, {
    kind: documentKindSchema.parse(text(form, "kind")),
    title: text(form, "title"),
  });
  redirect(`/documents/${id}?notice=created`);
}

export async function commitDocumentVersionAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const id = text(form, "documentId");
  const content = canonicalDocumentSchema.parse(
    JSON.parse(text(form, "content")),
  );
  try {
    await repository.commitVersion(principal, {
      documentId: id,
      baseVersionId: text(form, "baseVersionId"),
      content,
      idempotencyKey: text(form, "idempotencyKey"),
    });
  } catch (error) {
    if (error instanceof DocumentConflictError)
      redirect(`/documents/${id}?error=stale-version`);
    redirect(`/documents/${id}?error=version-save`);
  }
  redirect(`/documents/${id}?notice=version-saved`);
}

export async function restoreDocumentVersionAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const id = text(form, "documentId");
  await repository.restore(
    principal,
    id,
    text(form, "restoreVersionId"),
    text(form, "currentVersionId"),
  );
  redirect(`/documents/${id}?notice=restored`);
}

export async function archiveDocumentAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const id = text(form, "documentId");
  await repository.setArchived(
    principal,
    id,
    text(form, "archived") === "true",
  );
  redirect(`/documents/${id}?notice=status-updated`);
}

export async function updateDocumentsStatusAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const ids = selectedIds(form);
  const archived = archivedValue(form);
  await repository.setArchivedMany(principal, ids, archived);
  redirect(
    withNotice(
      safeReturnPath(form, "/documents", "/documents"),
      archived ? "archived" : "restored",
    ),
  );
}

export async function deleteDocumentsAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const ids = selectedIds(form);
  const returnPath = safeReturnPath(form, "/documents", "/documents");
  const store = new FilesystemArtifactStore(
    readServerEnvironment().ARTIFACT_STORAGE_ROOT,
  );
  try {
    await repository.deleteManyWithArtifacts(principal, ids, (storageKeys) =>
      store.stageDelete(storageKeys),
    );
  } catch (error) {
    if (error instanceof DocumentDependencyError)
      redirect(withNotice(returnPath, "delete-blocked"));
    if (error instanceof DocumentNotFoundError)
      redirect(withNotice(returnPath, "delete-unavailable"));
    throw error;
  }
  redirect(withNotice(returnPath, "deleted"));
}

export async function renameDocumentAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const id = text(form, "documentId");
  await repository.rename(principal, id, text(form, "title"));
  redirect(`/documents/${id}?notice=renamed`);
}

export async function setDocumentLockAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const id = text(form, "documentId");
  const targetType = text(form, "targetType");
  if (
    targetType !== "section" &&
    targetType !== "block" &&
    targetType !== "fact"
  )
    redirect(`/documents/${id}?error=invalid-lock`);
  try {
    await repository.setLock(principal, {
      documentId: id,
      targetType,
      targetId: text(form, "targetId"),
      locked: text(form, "locked") === "true",
    });
  } catch {
    redirect(`/documents/${id}?error=invalid-lock`);
  }
  redirect(`/documents/${id}?notice=lock-updated`);
}

export async function supportDocumentClaimAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const documentId = text(form, "documentId");
  try {
    await repository.supportClaimWithEvidence(principal, {
      documentId,
      claimId: text(form, "claimId"),
      evidenceFactId: text(form, "evidenceFactId"),
    });
  } catch {
    redirect(`/documents/${documentId}?error=claim-support`);
  }
  redirect(`/documents/${documentId}?notice=claim-supported`);
}

export async function markDocumentClaimNonfactualAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const documentId = text(form, "documentId");
  try {
    await repository.markClaimNonfactual(principal, {
      documentId,
      claimId: text(form, "claimId"),
    });
  } catch {
    redirect(`/documents/${documentId}?error=claim-support`);
  }
  redirect(`/documents/${documentId}?notice=claim-nonfactual`);
}

export async function approveDocumentClaimAsFactAction(
  form: FormData,
): Promise<void> {
  const { principal, repository } = await context();
  const documentId = text(form, "documentId");
  try {
    const claimText = await repository.getClaimText(
      principal,
      documentId,
      text(form, "claimId"),
    );
    const career = new CareerRepository(getRuntimePool());
    const proposalId = await career.createProposal(
      principal,
      text(form, "entryId"),
      {
        type: "statement",
        value: { kind: "text", text: claimText },
        displayText: claimText,
        sourceLocator: {
          kind: "manual",
          label: "Approved from a document claim",
        },
      },
    );
    const factId = await career.approveProposal(principal, proposalId);
    await repository.supportClaimWithEvidence(principal, {
      documentId,
      claimId: text(form, "claimId"),
      evidenceFactId: factId,
    });
  } catch {
    redirect(`/documents/${documentId}?error=claim-support`);
  }
  redirect(`/documents/${documentId}?notice=claim-supported`);
}
