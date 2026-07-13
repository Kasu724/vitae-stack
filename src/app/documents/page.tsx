import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ResourceCardList } from "@/components/resource-card-list";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  createDocumentAction,
  updateDocumentsStatusAction,
} from "@/modules/documents/actions";
import { DocumentRepository } from "@/modules/documents/repository";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const query = await searchParams;
  const status = query.status === "archived" ? "archived" : "active";
  const documents = await new DocumentRepository(getRuntimePool()).list(
    principal,
    status,
  );
  return (
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href="/dashboard">Dashboard</Link>{" "}
        <span aria-hidden="true">/</span> Document library
      </nav>
      <h1 className="mt-5 text-3xl font-bold">Document library</h1>
      <p className="mt-2 text-[var(--muted)]">
        Resumes and cover letters use immutable versions. Import sources, review
        extracted facts, tailor against evidence, and create private exports
        without rewriting version history.
      </p>
      {query.notice === "archived" || query.notice === "restored" ? (
        <p className="notice mt-6" role="status">
          Selected documents were {query.notice}.
        </p>
      ) : null}
      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="create-document-heading"
      >
        <h2 id="create-document-heading" className="text-xl font-semibold">
          Create document
        </h2>
        <form
          action={createDocumentAction}
          className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_auto]"
        >
          <label className="grid gap-1 font-medium">
            Title
            <input className="field" name="title" required maxLength={200} />
          </label>
          <label className="grid gap-1 font-medium">
            Type
            <select className="field" name="kind">
              <option value="resume">Resume</option>
              <option value="cover_letter">Cover letter</option>
            </select>
          </label>
          <button className="button self-end" type="submit">
            Create document
          </button>
        </form>
      </section>
      <form className="mt-8 flex items-end gap-3">
        <label className="grid gap-1 font-medium">
          Library status
          <select className="field" name="status" defaultValue={status}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <button className="secondary-button" type="submit">
          Apply
        </button>
      </form>
      <p role="status" className="mt-4 text-sm text-[var(--muted)]">
        {documents.length} {documents.length === 1 ? "document" : "documents"}
      </p>
      {documents.length ? (
        <ResourceCardList
          items={documents.map((document) => ({
            id: document.id,
            title: document.title,
            href: `/documents/${document.id}`,
            status: document.status,
            category:
              document.kind === "cover_letter" ? "Cover letter" : "Resume",
            metadata: [
              `Revision ${document.revision} · updated ${document.updated_at.toISOString().slice(0, 10)}`,
            ],
          }))}
          resourceName="document"
          resourceNamePlural="documents"
          status={status}
          archiveAction={updateDocumentsStatusAction}
          returnPath={
            status === "archived" ? "/documents?status=archived" : "/documents"
          }
        />
      ) : (
        <section className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-8">
          <h2 className="text-xl font-semibold">No {status} documents</h2>
          <p className="mt-2 text-[var(--muted)]">
            Create a document above or change the library status.
          </p>
        </section>
      )}
    </main>
  );
}
