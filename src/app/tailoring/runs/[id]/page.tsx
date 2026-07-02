import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { reviewTailoringRunAction } from "@/modules/tailoring/actions";
import {
  TailoringNotFoundError,
  TailoringRepository,
} from "@/modules/tailoring/repository";

export const dynamic = "force-dynamic";

function runStatusMessage(status: string, failureCode: string | null): string {
  if (status === "generating") return "Suggestions are still being generated.";
  if (status === "ready") return "Suggestions are ready for review.";
  if (status === "completed")
    return "This run was applied to a new document version.";
  if (status === "discarded")
    return "This run was discarded without changing the document.";
  return failureCode
    ? `Generation stopped safely (${failureCode}). The source document was not changed.`
    : "Generation stopped safely. The source document was not changed.";
}

export default async function TailoringRunPage({
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
  let view;
  try {
    view = await new TailoringRepository(getRuntimePool()).getRun(
      principal,
      id,
    );
  } catch (error) {
    if (error instanceof TailoringNotFoundError) notFound();
    throw error;
  }

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href={`/documents/${view.run.document_id}`}>
          {view.run.document_title}
        </Link>{" "}
        <span aria-hidden="true">/</span> Tailoring run
      </nav>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="status-label">{view.run.status}</span>
          <h1 className="mt-2 text-3xl font-bold">
            {view.run.kind === "resume"
              ? "Resume suggestions"
              : "Cover-letter suggestions"}
          </h1>
          <p className="mt-2 text-[var(--muted)]">
            {view.run.document_title} for {view.run.job_title}
          </p>
        </div>
        <Link
          className="secondary-button"
          href={`/documents/${view.run.document_id}`}
        >
          {view.run.kind === "resume"
            ? "Return to source resume"
            : "Return to source cover letter"}
        </Link>
      </div>

      <p
        className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
        role={view.run.status === "failed" ? "alert" : "status"}
      >
        {runStatusMessage(view.run.status, view.run.failure_code)} Suggestions
        do not alter the source document until each change is explicitly
        accepted.
      </p>
      {query.error === "stale" ? (
        <div
          className="mt-4 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          The source document changed after this run was created. No suggestion
          was applied. Start a new run against the current version.
        </div>
      ) : query.error === "invalid-review" ? (
        <div
          className="mt-4 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          The review could not be committed. Check that every suggestion has a
          decision, evidence remains approved, and no target is locked.
        </div>
      ) : query.notice === "discarded" ? (
        <p
          className="mt-4 rounded-lg border border-[var(--border)] p-4"
          role="status"
        >
          All suggestions were rejected. No document version was created.
        </p>
      ) : null}

      <section className="mt-8" aria-labelledby="suggestions-heading">
        <h2 id="suggestions-heading" className="text-2xl font-semibold">
          Proposed changes
        </h2>
        {view.suggestions.length ? (
          <form action={reviewTailoringRunAction} className="mt-4">
            <input type="hidden" name="runId" value={view.run.id} />
            <input
              type="hidden"
              name="documentId"
              value={view.run.document_id}
            />
            <ol className="grid gap-6">
              {view.suggestions.map((suggestion) => (
                <li
                  key={suggestion.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">
                      Suggestion {suggestion.sequence}
                    </h3>
                    <span className="status-label">{suggestion.status}</span>
                  </div>
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    {suggestion.rationale}
                  </p>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div>
                      <h4 className="font-semibold">Current text</h4>
                      <p className="mt-2 whitespace-pre-wrap rounded-lg border border-[var(--border)] p-4">
                        {suggestion.before_text || "Empty bullet"}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold">Proposed text</h4>
                      <p className="mt-2 whitespace-pre-wrap rounded-lg border border-[var(--border)] p-4">
                        {suggestion.after_text}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm">
                    Requirement IDs: {suggestion.requirement_ids.join(", ")}
                  </p>
                  {view.run.status === "ready" &&
                  suggestion.status === "pending" ? (
                    <fieldset className="mt-5 rounded-lg border border-[var(--border)] p-4">
                      <legend className="px-2 font-semibold">
                        Review decision
                      </legend>
                      <input
                        type="hidden"
                        name="suggestionId"
                        value={suggestion.id}
                      />
                      <div className="flex flex-wrap gap-5">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`decision:${suggestion.id}`}
                            value="accepted"
                            required
                          />
                          Accept
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`decision:${suggestion.id}`}
                            value="rejected"
                            required
                            defaultChecked
                          />
                          Reject
                        </label>
                      </div>
                      <label className="mt-4 grid gap-1 font-medium">
                        Text to use if accepted
                        <textarea
                          className="field min-h-28"
                          name={`editedText:${suggestion.id}`}
                          defaultValue={suggestion.after_text ?? ""}
                          maxLength={20_000}
                        />
                      </label>
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        Editing this text removes inherited support and marks
                        the accepted span unverified until evidence is linked.
                      </p>
                    </fieldset>
                  ) : null}
                  <div className="mt-5">
                    <h4 className="font-semibold">Claim evidence</h4>
                    <ul className="mt-2 grid gap-3">
                      {suggestion.claims.map((claim) => {
                        const claimText = (suggestion.after_text ?? "").slice(
                          claim.start_offset,
                          claim.end_offset,
                        );
                        return (
                          <li
                            key={claim.id}
                            className="rounded-lg border border-[var(--border)] p-4"
                          >
                            <p>
                              <strong>Claim:</strong> “{claimText}”
                            </p>
                            <p className="mt-1 text-sm text-[var(--muted)]">
                              Support relation: {claim.relation}
                            </p>
                            <ul className="mt-2 grid gap-2">
                              {claim.evidence.map((evidence) => (
                                <li key={evidence.id}>
                                  <Link href={`/career/${evidence.entryId}`}>
                                    {evidence.displayText}
                                  </Link>{" "}
                                  <span className="text-sm text-[var(--muted)]">
                                    ({evidence.status}
                                    {evidence.sourceLabel
                                      ? `; ${evidence.sourceLabel}`
                                      : ""}
                                    ; evidence {evidence.id})
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                    {!suggestion.claims.length ? (
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        This is repository-owned generic framing and contains no
                        factual claim.
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
            {view.run.status === "ready" ? (
              <div className="mt-6 flex flex-wrap gap-3">
                <button className="button" type="submit">
                  Commit review decisions
                </button>
                <Link
                  className="secondary-button"
                  href={`${view.run.kind === "resume" ? "/tailoring/resume" : "/tailoring/cover-letter"}?documentId=${view.run.document_id}`}
                >
                  Start a new run
                </Link>
              </div>
            ) : null}
          </form>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-[var(--border)] p-6">
            No safe suggestions were produced. Review the evidence gaps below or
            adjust the selected inputs in a new run.
          </p>
        )}
      </section>

      <section className="mt-8" aria-labelledby="gaps-heading">
        <h2 id="gaps-heading" className="text-2xl font-semibold">
          Evidence gaps
        </h2>
        {view.gaps.length ? (
          <ul className="mt-4 grid gap-3">
            {view.gaps.map((gap) => (
              <li
                key={`${gap.requirement_id}:${gap.code}`}
                className="rounded-lg border border-[var(--border)] p-4"
              >
                <strong>{gap.requirement_text}</strong>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {gap.detail} ({gap.code})
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[var(--muted)]">
            No generation gaps were recorded.
          </p>
        )}
      </section>

      <details className="mt-8 rounded-lg border border-[var(--border)] p-4">
        <summary className="cursor-pointer font-semibold">
          Pinned run details
        </summary>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Input hash</dt>
            <dd className="break-all">{view.run.manifest.inputHash}</dd>
          </div>
          <div>
            <dt className="font-semibold">Base content hash</dt>
            <dd className="break-all">{view.run.manifest.baseContentHash}</dd>
          </div>
          <div>
            <dt className="font-semibold">Job content hash</dt>
            <dd className="break-all">{view.run.manifest.jobContentHash}</dd>
          </div>
          <div>
            <dt className="font-semibold">Task versions</dt>
            <dd>{view.run.manifest.taskVersions.join(", ")}</dd>
          </div>
          <div>
            <dt className="font-semibold">Tone</dt>
            <dd>{view.run.manifest.selectedTone}</dd>
          </div>
          <div>
            <dt className="font-semibold">Target length</dt>
            <dd>{view.run.manifest.targetLength}</dd>
          </div>
          <div>
            <dt className="font-semibold">Pinned locks</dt>
            <dd>
              {view.run.manifest.lockedHashes.length} locks protecting{" "}
              {view.run.manifest.lockedBlockIds.length} blocks
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Created</dt>
            <dd>{view.run.created_at.toISOString()}</dd>
          </div>
        </dl>
      </details>
    </main>
  );
}
