import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  archiveDocumentAction,
  approveDocumentClaimAsFactAction,
  markDocumentClaimNonfactualAction,
  renameDocumentAction,
  restoreDocumentVersionAction,
  setDocumentLockAction,
  supportDocumentClaimAction,
} from "@/modules/documents/actions";
import { CareerRepository } from "@/modules/career/repository";
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
  "lock-updated": "Document lock updated.",
  "tailoring-applied":
    "Accepted tailoring suggestions were saved as one immutable version.",
  "claim-supported":
    "Claim support was saved as a new immutable document version.",
  "claim-nonfactual":
    "The selected text was classified as nonfactual in a new immutable version.",
};

const errors: Record<string, string> = {
  "invalid-lock":
    "The lock could not be changed because the target is unavailable or no longer current.",
  "claim-support":
    "Claim support was not changed. The claim or evidence may be stale, ineligible, or insufficient for the exact text.",
  "stale-version":
    "The document changed before this version could be saved. Your submitted text was not applied. Reload the current version and compare before retrying.",
  "version-save":
    "The immutable version could not be saved. The document was not changed.",
};

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
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
  const [locks, eligibleFacts, claims, activeEntries] = await Promise.all([
    repository.listLocks(principal, id),
    new CareerRepository(getRuntimePool()).listEligibleFacts(principal),
    repository.listClaims(principal, id),
    new CareerRepository(getRuntimePool()).listEntries(principal),
  ]);
  const lockKeys = new Set(
    locks.map((lock) => `${lock.target_type}:${lock.target_id}`),
  );
  const notice =
    typeof query.notice === "string" ? notices[query.notice] : undefined;
  const error =
    typeof query.error === "string" ? errors[query.error] : undefined;
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
      {error ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          {error}
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
      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="locks-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="locks-heading" className="text-xl font-semibold">
              Tailoring locks
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Locked sections, blocks, and facts are pinned by hash and cannot
              be changed by a tailoring suggestion.
            </p>
          </div>
          <Link
            className="button"
            href={
              data.document.kind === "resume"
                ? `/tailoring/resume?documentId=${id}`
                : `/tailoring/cover-letter?documentId=${id}`
            }
          >
            {data.document.kind === "resume"
              ? "Tailor this resume"
              : "Tailor this cover letter"}
          </Link>
          <Link className="secondary-button" href={`/ats?documentId=${id}`}>
            Run estimated ATS analysis
          </Link>
          <Link className="secondary-button" href={`/exports?documentId=${id}`}>
            Export document
          </Link>
        </div>
        <ul className="mt-5 grid min-w-0 gap-4">
          {data.currentVersion.content.sections.map((section) => {
            const sectionLocked = lockKeys.has(`section:${section.id}`);
            return (
              <li
                key={section.id}
                className="min-w-0 rounded-lg border border-[var(--border)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{section.heading || section.type}</strong>
                  <form action={setDocumentLockAction}>
                    <input type="hidden" name="documentId" value={id} />
                    <input type="hidden" name="targetType" value="section" />
                    <input type="hidden" name="targetId" value={section.id} />
                    <input
                      type="hidden"
                      name="locked"
                      value={sectionLocked ? "false" : "true"}
                    />
                    <button className="secondary-button" type="submit">
                      {sectionLocked ? "Unlock section" : "Lock section"}
                    </button>
                  </form>
                </div>
                <ul className="mt-3 grid min-w-0 gap-2">
                  {section.blocks.map((block, index) => {
                    const blockLocked = lockKeys.has(`block:${block.id}`);
                    return (
                      <li
                        key={block.id}
                        className="min-w-0 flex flex-wrap items-center justify-between gap-3 rounded-md bg-[var(--background)] p-3"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          Block {index + 1}: {block.text || "Empty"}
                        </span>
                        <form action={setDocumentLockAction}>
                          <input type="hidden" name="documentId" value={id} />
                          <input
                            type="hidden"
                            name="targetType"
                            value="block"
                          />
                          <input
                            type="hidden"
                            name="targetId"
                            value={block.id}
                          />
                          <input
                            type="hidden"
                            name="locked"
                            value={blockLocked ? "false" : "true"}
                          />
                          <button className="secondary-button" type="submit">
                            {blockLocked ? "Unlock block" : "Lock block"}
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
        <details className="mt-5">
          <summary className="cursor-pointer font-semibold">
            Lock approved facts
          </summary>
          {eligibleFacts.length ? (
            <ul className="mt-3 grid min-w-0 gap-2">
              {eligibleFacts.map((fact) => {
                const factLocked = lockKeys.has(`fact:${fact.id}`);
                return (
                  <li
                    key={fact.id}
                    className="min-w-0 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] p-3"
                  >
                    <span>{fact.display_text}</span>
                    <form action={setDocumentLockAction}>
                      <input type="hidden" name="documentId" value={id} />
                      <input type="hidden" name="targetType" value="fact" />
                      <input type="hidden" name="targetId" value={fact.id} />
                      <input
                        type="hidden"
                        name="locked"
                        value={factLocked ? "false" : "true"}
                      />
                      <button className="secondary-button" type="submit">
                        {factLocked ? "Unlock fact" : "Lock fact"}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-[var(--muted)]">
              No approved active facts are available.
            </p>
          )}
        </details>
      </section>
      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="claim-support-heading"
      >
        <h2 id="claim-support-heading" className="text-xl font-semibold">
          Claim support
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Supported claims retain immutable evidence links. A manually edited
          factual span is unverified until you link matching approved evidence
          or explicitly approve it as a new career fact.
        </p>
        {query.error === "claim-support" ? (
          <p
            className="mt-4 rounded-lg border border-[var(--danger)] p-4"
            role="alert"
          >
            The claim could not be supported. Confirm the document is current
            and the selected evidence entails the entire claim, including
            metrics.
          </p>
        ) : null}
        {claims.length ? (
          <ul className="mt-4 grid gap-4">
            {claims.map((claim) => (
              <li
                key={claim.id}
                className="rounded-lg border border-[var(--border)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium">“{claim.text}”</p>
                  <span className="status-label">{claim.status}</span>
                </div>
                {claim.evidence.length ? (
                  <ul className="mt-2 text-sm text-[var(--muted)]">
                    {claim.evidence.map((evidence) => (
                      <li key={evidence.id}>
                        {evidence.displayText} ({evidence.status}; {evidence.id}
                        )
                      </li>
                    ))}
                  </ul>
                ) : null}
                {claim.status === "unverified" ? (
                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    <form
                      action={supportDocumentClaimAction}
                      className="grid gap-2"
                    >
                      <input type="hidden" name="documentId" value={id} />
                      <input type="hidden" name="claimId" value={claim.id} />
                      <label className="grid gap-1 font-medium">
                        Link approved evidence
                        <select
                          className="field"
                          name="evidenceFactId"
                          required
                          disabled={!eligibleFacts.length}
                        >
                          {eligibleFacts.length ? (
                            eligibleFacts.map((fact) => (
                              <option key={fact.id} value={fact.id}>
                                {fact.display_text}
                              </option>
                            ))
                          ) : (
                            <option value="">No approved facts</option>
                          )}
                        </select>
                      </label>
                      <button
                        className="secondary-button w-fit"
                        type="submit"
                        disabled={!eligibleFacts.length}
                      >
                        Link and create version
                      </button>
                    </form>
                    <form
                      action={approveDocumentClaimAsFactAction}
                      className="grid gap-2"
                    >
                      <input type="hidden" name="documentId" value={id} />
                      <input type="hidden" name="claimId" value={claim.id} />
                      <label className="grid gap-1 font-medium">
                        Approve as a new fact under
                        <select
                          className="field"
                          name="entryId"
                          required
                          disabled={!activeEntries.length}
                        >
                          {activeEntries.length ? (
                            activeEntries.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.title}
                              </option>
                            ))
                          ) : (
                            <option value="">No active entries</option>
                          )}
                        </select>
                      </label>
                      <button
                        className="secondary-button w-fit"
                        type="submit"
                        disabled={!activeEntries.length}
                      >
                        Approve fact and create version
                      </button>
                    </form>
                    <form
                      action={markDocumentClaimNonfactualAction}
                      className="grid content-start gap-2"
                    >
                      <input type="hidden" name="documentId" value={id} />
                      <input type="hidden" name="claimId" value={claim.id} />
                      <p className="font-medium">No factual assertion</p>
                      <p className="text-sm text-[var(--muted)]">
                        Use only for framing, salutation, transition, or other
                        prose that makes no claim about you.
                      </p>
                      <button className="secondary-button w-fit" type="submit">
                        Mark nonfactual and create version
                      </button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[var(--muted)]">
            This version has no tracked factual claims yet.
          </p>
        )}
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
