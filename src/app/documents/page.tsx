import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ResourceCardList } from "@/components/resource-card-list";
import { StatusTabs } from "@/components/status-tabs";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  createDocumentAction,
  deleteDocumentsAction,
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
  const repository = new DocumentRepository(getRuntimePool());
  const documents = await repository.list(principal, status);
  const dependencyPreviews = new Map(
    await Promise.all(
      documents.map(
        async (document) =>
          [
            document.id,
            await repository.dependencyPreview(principal, document.id),
          ] as const,
      ),
    ),
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
      {typeof query.notice === "string" ? (
        <p
          className={
            query.notice === "delete-blocked" ||
            query.notice === "delete-unavailable"
              ? "mt-6 rounded-lg border border-[var(--danger)] p-4"
              : "notice mt-6"
          }
          role={
            query.notice === "delete-blocked" ||
            query.notice === "delete-unavailable"
              ? "alert"
              : "status"
          }
        >
          {query.notice === "deleted"
            ? "The selected documents, their complete version histories, and their private export artifacts were deleted."
            : query.notice === "delete-blocked"
              ? "At least one selected document has an unexpected external history dependency, so none of the selected documents were deleted."
              : query.notice === "delete-unavailable"
                ? "The selected documents changed or are no longer available, so none of them were deleted. Reload and review the selection."
                : `Selected documents were ${query.notice}.`}
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
      <div className="mt-8">
        <StatusTabs
          activeHref="/documents"
          archivedHref="/documents?status=archived"
          currentStatus={status}
          label="Document library status"
        />
      </div>
      <p role="status" className="mt-4 text-sm text-[var(--muted)]">
        {documents.length} {documents.length === 1 ? "document" : "documents"}
      </p>
      {documents.length ? (
        <ResourceCardList
          items={documents.map((document) => {
            const preview = dependencyPreviews.get(document.id)!;
            const derivedRecords =
              preview.claims +
              preview.drafts +
              preview.locks +
              preview.tailoringRuns +
              preview.atsReports;
            return {
              id: document.id,
              title: document.title,
              href: `/documents/${document.id}`,
              status: document.status,
              category:
                document.kind === "cover_letter" ? "Cover letter" : "Resume",
              metadata: [
                `Revision ${document.revision} · updated ${document.updated_at.toISOString().slice(0, 10)}`,
              ],
              deleteImpact: [
                preview.externalReferences > 0
                  ? `${preview.externalReferences} external history ${preview.externalReferences === 1 ? "reference blocks" : "references block"} permanent deletion.`
                  : "No external history references block permanent deletion.",
                `${preview.versions} immutable ${preview.versions === 1 ? "version" : "versions"} and ${derivedRecords} claim, draft, lock, tailoring, or ATS records will also be deleted.`,
                `${preview.exportArtifacts} private export ${preview.exportArtifacts === 1 ? "artifact" : "artifacts"} (${preview.artifactBytes} bytes) will also be deleted.`,
              ],
            };
          })}
          resourceName="document"
          resourceNamePlural="documents"
          status={status}
          archiveAction={updateDocumentsStatusAction}
          deleteAction={deleteDocumentsAction}
          deleteWarning="Permanent deletion cannot be undone. The complete version history, claims, tailoring runs, ATS reports, and managed export files for every selected document will be removed. The whole selection fails without changes if any document is unavailable or externally referenced. Copies downloaded outside Vitae Stack remain under your control."
          returnPath={
            status === "archived" ? "/documents?status=archived" : "/documents"
          }
        />
      ) : (
        <section className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-8">
          <h2 className="text-xl font-semibold">No {status} documents</h2>
          <p className="mt-2 text-[var(--muted)]">
            Create a document above or choose the other status tab.
          </p>
        </section>
      )}
    </main>
  );
}
