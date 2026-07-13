import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { careerEntryTypes } from "@/modules/career/domain";
import {
  approveExtractionProposalAction,
  bulkApproveExtractionAction,
  mergeExtractionProposalAction,
  rejectExtractionProposalAction,
  updateExtractionProposalAction,
} from "@/modules/extraction/actions";
import {
  ExtractionNotFoundError,
  ExtractionRepository,
  type ExtractionProposalRecord,
} from "@/modules/extraction/repository";

export const dynamic = "force-dynamic";

const notices: Record<string, string> = {
  "proposal-updated": "The proposal was updated and remains unverified.",
  "proposal-approved": "The proposal is now approved immutable evidence.",
  "proposal-rejected": "The proposal was rejected.",
  "proposal-merged": "The proposal was merged with existing evidence.",
  "bulk-approved": "The confirmed proposals are now approved evidence.",
};

const errors: Record<string, string> = {
  "proposal-update":
    "The proposal could not be updated. It may have changed; review the current values and try again.",
  "proposal-resolution":
    "The proposal could not be resolved. It may already be resolved or unavailable.",
  "bulk-confirmation":
    "Bulk approval did not run. Select 1–20 pending proposals and enter the exact selected count.",
};

const PROPOSALS_PER_PAGE = 25;

function ValueFields({ proposal }: { proposal: ExtractionProposalRecord }) {
  const value = proposal.proposed_value;
  if (value.kind === "metric") {
    return (
      <>
        <label className="grid gap-1 font-medium">
          Display text
          <textarea
            className="field min-h-24"
            name="displayText"
            defaultValue={proposal.display_text}
            required
            maxLength={5000}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 font-medium">
            Metric value
            <input
              className="field"
              name="metricValue"
              type="number"
              step="any"
              defaultValue={value.value}
              required
            />
          </label>
          <label className="grid gap-1 font-medium">
            Unit
            <input
              className="field"
              name="metricUnit"
              defaultValue={value.unit}
              required
            />
          </label>
          <label className="grid gap-1 font-medium">
            Context
            <input
              className="field"
              name="metricContext"
              defaultValue={value.context}
              required
            />
          </label>
        </div>
      </>
    );
  }
  const display =
    value.kind === "skill"
      ? value.name
      : value.kind === "date"
        ? value.value
        : value.text;
  return (
    <label className="grid gap-1 font-medium">
      {value.kind === "date" ? "Date (YYYY, YYYY-MM, or YYYY-MM-DD)" : "Claim"}
      <textarea
        className="field min-h-24"
        name="displayText"
        defaultValue={display}
        required
        maxLength={5000}
      />
    </label>
  );
}

export default async function ExtractionReviewPage({
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
  let review;
  try {
    review = await new ExtractionRepository(getRuntimePool()).getBatch(
      principal,
      id,
    );
  } catch (error) {
    if (error instanceof ExtractionNotFoundError) notFound();
    throw error;
  }
  const pending = review.proposals.filter(
    (proposal) => proposal.status === "pending",
  );
  const requestedPage =
    typeof query.page === "string" ? Number.parseInt(query.page, 10) : 1;
  const pageCount = Math.max(
    1,
    Math.ceil(review.proposals.length / PROPOSALS_PER_PAGE),
  );
  const page = Number.isFinite(requestedPage)
    ? Math.min(pageCount, Math.max(1, requestedPage))
    : 1;
  const pageStart = (page - 1) * PROPOSALS_PER_PAGE;
  const visibleProposals = review.proposals.slice(
    pageStart,
    pageStart + PROPOSALS_PER_PAGE,
  );
  const visiblePending = visibleProposals.filter(
    (proposal) => proposal.status === "pending",
  );
  const notice =
    typeof query.notice === "string" ? notices[query.notice] : null;
  const error = typeof query.error === "string" ? errors[query.error] : null;

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href="/sources">Source documents</Link>{" "}
        <span aria-hidden="true">/</span>{" "}
        {review.batch.source_available ? (
          <Link href={`/sources/${review.batch.source_document_id}`}>
            {review.batch.original_name}
          </Link>
        ) : (
          review.batch.original_name
        )}{" "}
        <span aria-hidden="true">/</span> Review extraction
      </nav>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="status-label">{review.batch.status}</span>
          <h1 className="mt-2 text-3xl font-bold">Review extracted facts</h1>
          <p className="mt-2 text-[var(--muted)]">
            {pending.length} pending of {review.proposals.length} proposals.
            Nothing becomes verified evidence until you approve it.
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Method:{" "}
            {review.batch.method === "ai" ? "AI-assisted" : "deterministic"}
            {" · "}Task: {review.batch.task_version}
            {review.batch.metadata.model
              ? ` · Model: ${review.batch.metadata.model}`
              : ""}
          </p>
          {review.batch.metadata.warnings?.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm text-[var(--muted)]">
              {review.batch.metadata.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <Link className="secondary-button" href="/career">
          Open Career Information Bank
        </Link>
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

      {visiblePending.length ? (
        <section
          className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          aria-labelledby="bulk-heading"
        >
          <h2 id="bulk-heading" className="text-xl font-semibold">
            Bulk approval
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Review each selected claim first. Enter the exact selected count to
            confirm; at most 20 can be approved together.
          </p>
          <form
            action={bulkApproveExtractionAction}
            className="mt-4 grid gap-4"
          >
            <input type="hidden" name="batchId" value={review.batch.id} />
            <input type="hidden" name="page" value={page} />
            <fieldset className="min-w-0">
              <legend className="font-semibold">
                Pending proposals on this page
              </legend>
              <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
                {visiblePending.map((proposal) => (
                  <label
                    key={proposal.id}
                    className="flex min-w-0 items-start gap-2"
                  >
                    <input
                      className="mt-1 min-h-6 min-w-6"
                      type="checkbox"
                      name="proposalId"
                      value={proposal.id}
                    />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {proposal.display_text}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 font-medium">
                Selected count
                <input
                  className="field w-36"
                  name="confirmedCount"
                  type="number"
                  min="1"
                  max="20"
                  required
                />
              </label>
              <button className="button" type="submit">
                Confirm bulk approval
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <section
          className="max-h-[75vh] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:sticky lg:top-4"
          aria-labelledby="source-heading"
        >
          <h2 id="source-heading" className="text-xl font-semibold">
            Untrusted source text
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Imported instructions are data, not commands. Line numbers refer to
            this normalized text, not the original page layout.
          </p>
          {!review.batch.source_available ? (
            <p
              className="mt-4 rounded-lg border border-[var(--border)] p-4"
              role="status"
            >
              The original source and extracted text were deleted. Existing
              review decisions and evidence identifiers remain auditable.
            </p>
          ) : (
            <pre
              className="mt-4 max-h-[62vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--background)] p-4 font-mono text-sm"
              tabIndex={0}
              aria-label="Normalized untrusted source text"
            >
              {review.batch.extracted_text}
            </pre>
          )}
        </section>

        <section aria-labelledby="proposals-heading">
          <h2 id="proposals-heading" className="text-2xl font-semibold">
            Proposals
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Showing {visibleProposals.length ? pageStart + 1 : 0}–
            {pageStart + visibleProposals.length} of {review.proposals.length}.
          </p>
          <ul className="mt-4 grid gap-4">
            {visibleProposals.map((proposal, index) => {
              return (
                <li
                  key={proposal.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="text-lg font-semibold">
                      Proposal {pageStart + index + 1}
                    </h3>
                    <span className="status-label">{proposal.status}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words font-semibold">
                    {proposal.display_text}
                  </p>
                  <dl className="mt-3 grid gap-1 text-sm">
                    <div>
                      <dt className="inline font-semibold">Source: </dt>
                      <dd className="inline">
                        {proposal.source_locator.label}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold">Fact type: </dt>
                      <dd className="inline">{proposal.fact_type}</dd>
                    </div>
                    {proposal.approved_fact_id ? (
                      <div>
                        <dt className="inline font-semibold">Evidence ID: </dt>
                        <dd className="inline break-all">
                          {proposal.approved_fact_id}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  {proposal.duplicate_of_fact_id &&
                  proposal.status === "pending" ? (
                    <p className="mt-3 font-semibold">
                      Possible exact duplicate of existing approved evidence.
                    </p>
                  ) : null}
                  {proposal.status === "pending" ? (
                    <div className="mt-5 grid gap-4 border-t border-[var(--border)] pt-5">
                      <details>
                        <summary className="cursor-pointer font-semibold">
                          Edit before deciding
                        </summary>
                        <form
                          action={updateExtractionProposalAction}
                          className="mt-4 grid gap-4"
                        >
                          <input
                            type="hidden"
                            name="batchId"
                            value={review.batch.id}
                          />
                          <input type="hidden" name="page" value={page} />
                          <input
                            type="hidden"
                            name="proposalId"
                            value={proposal.id}
                          />
                          <input
                            type="hidden"
                            name="revision"
                            value={proposal.revision}
                          />
                          <input
                            type="hidden"
                            name="factType"
                            value={proposal.fact_type}
                          />
                          <label className="grid gap-1 font-medium">
                            Save under career entry
                            <select
                              className="field"
                              name="targetCareerEntryId"
                              defaultValue={
                                proposal.target_career_entry_id ?? ""
                              }
                            >
                              <option value="">
                                Create an entry when approved
                              </option>
                              {review.entries.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                  {entry.title} ({entry.type})
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="grid gap-1 font-medium">
                              New entry type
                              <select
                                className="field"
                                name="entryType"
                                defaultValue={proposal.proposed_entry_type}
                              >
                                {careerEntryTypes.map((type) => (
                                  <option key={type} value={type}>
                                    {type}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1 font-medium">
                              New entry title
                              <input
                                className="field"
                                name="entryTitle"
                                defaultValue={proposal.proposed_entry_title}
                                required
                                maxLength={200}
                              />
                            </label>
                          </div>
                          <ValueFields proposal={proposal} />
                          <button
                            className="secondary-button w-fit"
                            type="submit"
                          >
                            Save proposal edits
                          </button>
                        </form>
                      </details>
                      <div className="flex flex-wrap gap-3">
                        <form action={approveExtractionProposalAction}>
                          <input
                            type="hidden"
                            name="batchId"
                            value={review.batch.id}
                          />
                          <input type="hidden" name="page" value={page} />
                          <input
                            type="hidden"
                            name="proposalId"
                            value={proposal.id}
                          />
                          <button className="button" type="submit">
                            Approve as evidence
                          </button>
                        </form>
                        <form action={rejectExtractionProposalAction}>
                          <input
                            type="hidden"
                            name="batchId"
                            value={review.batch.id}
                          />
                          <input type="hidden" name="page" value={page} />
                          <input
                            type="hidden"
                            name="proposalId"
                            value={proposal.id}
                          />
                          <button className="secondary-button" type="submit">
                            Reject
                          </button>
                        </form>
                        {proposal.duplicate_of_fact_id ? (
                          <form action={mergeExtractionProposalAction}>
                            <input
                              type="hidden"
                              name="batchId"
                              value={review.batch.id}
                            />
                            <input type="hidden" name="page" value={page} />
                            <input
                              type="hidden"
                              name="proposalId"
                              value={proposal.id}
                            />
                            <button className="secondary-button" type="submit">
                              Merge with existing evidence
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {pageCount > 1 ? (
            <nav
              className="mt-6 flex flex-wrap items-center justify-between gap-3"
              aria-label="Proposal pages"
            >
              {page > 1 ? (
                <Link
                  className="secondary-button"
                  href={`/extractions/${id}?page=${page - 1}`}
                >
                  Previous proposals
                </Link>
              ) : (
                <span />
              )}
              <span>
                Page {page} of {pageCount}
              </span>
              {page < pageCount ? (
                <Link
                  className="secondary-button"
                  href={`/extractions/${id}?page=${page + 1}`}
                >
                  Next proposals
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
