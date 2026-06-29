"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";

import { canonicalDocumentSchema, documentKindSchema } from "./document-schema";
import { DocumentRepository } from "./repository";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function context() {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/sign-in");
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
  await repository.commitVersion(principal, {
    documentId: id,
    baseVersionId: text(form, "baseVersionId"),
    content,
    idempotencyKey: text(form, "idempotencyKey"),
  });
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

export async function renameDocumentAction(form: FormData): Promise<void> {
  const { principal, repository } = await context();
  const id = text(form, "documentId");
  await repository.rename(principal, id, text(form, "title"));
  redirect(`/documents/${id}?notice=renamed`);
}
