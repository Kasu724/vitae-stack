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

function lineFromLocator(proposal: ExtractionProposalRecord): number | null {
  const match = /^Line (\d+)$/u.exec(proposal.source_locator.section ?? "");
  return match ? Number(match[1]) : null;
}

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
  const lines = review.batch.extracted_text.split(/\n/gu);
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

      {pending.length ? (
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
            <fieldset>
              <legend className="font-semibold">Pending proposals</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {pending.map((proposal) => (
                  <label key={proposal.id} className="flex items-start gap-2">
                    <input
                      className="mt-1 min-h-5 min-w-5"
                      type="checkbox"
                      name="proposalId"
                      value={proposal.id}
                    />
                    <span>{proposal.display_text}</span>
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
            <ol className="mt-4 grid list-none gap-1 font-mono text-sm">
              {lines.map((line, index) => (
                <li
                  id={`source-line-${index + 1}`}
                  key={index}
                  className="grid scroll-mt-4 grid-cols-[3rem_1fr] gap-3 rounded px-2 py-1 target:bg-[var(--background)]"
                >
                  <span
                    aria-hidden="true"
                    className="select-none text-right text-[var(--muted)]"
                  >
                    {index + 1}
                  </span>
                  <span className="whitespace-pre-wrap break-words">
                    {line || " "}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="proposals-heading">
          <h2 id="proposals-heading" className="text-2xl font-semibold">
            Proposals
          </h2>
          <ul className="mt-4 grid gap-4">
            {review.proposals.map((proposal, index) => {
              const sourceLine = lineFromLocator(proposal);
              return (
                <li
                  key={proposal.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="text-lg font-semibold">
                      Proposal {index + 1}
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
                        {sourceLine && review.batch.source_available ? (
                          <a href={`#source-line-${sourceLine}`}>
                            {proposal.source_locator.label}
                          </a>
                        ) : (
                          proposal.source_locator.label
                        )}
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
        </section>
      </div>
    </main>
  );
}
