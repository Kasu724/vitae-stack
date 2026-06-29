import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  archiveDocumentAction,
  renameDocumentAction,
  restoreDocumentVersionAction,
} from "@/modules/documents/actions";
import { DocumentEditor } from "@/modules/documents/components/document-editor";
import {
  DocumentNotFoundError,
  DocumentRepository,
} from "@/modules/documents/repository";

export const dynamic = "force-dynamic";

const notices: Record<string, string> = {
  created: "Document and initial immutable version created.",
  "version-saved": "A new immutable version was saved.",
  restored: "Historical content was restored as a new version.",
  "status-updated": "Document status updated.",
  renamed: "Document title updated.",
};

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/sign-in");
  const { id } = await params;
  const query = await searchParams;
  const repository = new DocumentRepository(getRuntimePool());
  let data;
  try {
    data = await repository.get(principal, id);
  } catch (error) {
    if (error instanceof DocumentNotFoundError) notFound();
    throw error;
  }
  const compareId = typeof query.compare === "string" ? query.compare : null;
  let diff = null;
  if (compareId && compareId !== data.currentVersion.id) {
    try {
      diff = await repository.compare(
        principal,
        id,
        compareId,
        data.currentVersion.id,
      );
    } catch (error) {
      if (!(error instanceof DocumentNotFoundError)) throw error;
    }
  }
  const editorContent =
    data.draft?.base_version_id === data.currentVersion.id
      ? data.draft.content
      : data.currentVersion.content;
  const notice =
    typeof query.notice === "string" ? notices[query.notice] : undefined;
  return (
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href="/documents">Document library</Link>{" "}
        <span aria-hidden="true">/</span> {data.document.title}
      </nav>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="status-label">{data.document.status}</span>
          <h1 className="mt-2 text-3xl font-bold">{data.document.title}</h1>
          <p className="mt-1 text-[var(--muted)]">
            {data.document.kind === "cover_letter" ? "Cover letter" : "Resume"}{" "}
            · version {data.currentVersion.id.slice(0, 8)}
          </p>
        </div>
        <form action={archiveDocumentAction}>
          <input type="hidden" name="documentId" value={id} />
          <input
            type="hidden"
            name="archived"
            value={data.document.status === "active" ? "true" : "false"}
          />
          <button className="secondary-button" type="submit">
            {data.document.status === "active"
              ? "Archive document"
              : "Restore to library"}
          </button>
        </form>
      </div>
      {notice ? (
        <p className="notice mt-6" role="status">
          {notice}
        </p>
      ) : null}
      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="metadata-heading"
      >
        <h2 id="metadata-heading" className="text-xl font-semibold">
          Document details
        </h2>
        <form
          action={renameDocumentAction}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="documentId" value={id} />
          <label className="grid flex-1 gap-1 font-medium">
            Title
            <input
              className="field"
              name="title"
              defaultValue={data.document.title}
              required
              maxLength={200}
            />
          </label>
          <button className="secondary-button" type="submit">
            Rename
          </button>
        </form>
      </section>
      <section className="mt-8" aria-labelledby="editor-heading">
        <h2 id="editor-heading" className="text-2xl font-semibold">
          Structured editor
        </h2>
        <p className="mt-2 mb-5 text-[var(--muted)]">
          Changes autosave as a private mutable draft. Use Save immutable
          version to add them to history.
        </p>
        <DocumentEditor
          documentId={id}
          baseVersionId={data.currentVersion.id}
          initialContent={editorContent}
          initialDraftRevision={data.draft?.revision ?? 0}
          idempotencyKey={crypto.randomUUID()}
        />
      </section>
      <section className="mt-10" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-2xl font-semibold">
          Version history
        </h2>
        {diff ? (
          <div className="notice mt-4" role="status">
            <h3 className="font-semibold">Comparison with current version</h3>
            <p className="mt-1">
              Changed sections: {diff.changedSections.length}; changed blocks:{" "}
              {diff.changedBlocks.length}; added blocks:{" "}
              {diff.addedBlocks.length}; removed blocks:{" "}
              {diff.removedBlocks.length}; changed claims:{" "}
              {diff.changedClaims.length}; provenance changes:{" "}
              {diff.provenanceChanges.length}.
            </p>
          </div>
        ) : null}
        <ol className="mt-4 grid gap-3">
          {data.versions.map((version) => (
            <li
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
              key={version.id}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <strong>{version.reason.replaceAll("_", " ")}</strong>
                  <p className="text-sm text-[var(--muted)]">
                    {version.created_at.toISOString()} · {version.id}
                  </p>
                </div>
                {version.id === data.currentVersion.id ? (
                  <span className="status-label">current</span>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      className="secondary-button"
                      href={`/documents/${id}?compare=${version.id}`}
                    >
                      Compare
                    </Link>
                    <form action={restoreDocumentVersionAction}>
                      <input type="hidden" name="documentId" value={id} />
                      <input
                        type="hidden"
                        name="restoreVersionId"
                        value={version.id}
                      />
                      <input
                        type="hidden"
                        name="currentVersionId"
                        value={data.currentVersion.id}
                      />
                      <button className="secondary-button" type="submit">
                        Restore as new version
                      </button>
                    </form>
                  </div>
                )}
              </div>
              <p className="mt-2 break-all text-sm">
                Hash: {version.content_hash}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
