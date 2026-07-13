import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  approveFactProposalAction,
  createFactProposalAction,
  deleteCareerEntryAction,
  linkSkillAction,
  rejectFactProposalAction,
  setCareerEntryArchivedAction,
  supersedeFactAction,
  updateCareerEntryAction,
  withdrawFactAction,
} from "@/modules/career/actions";
import { EntryForm } from "@/modules/career/components/entry-form";
import { FactForm } from "@/modules/career/components/fact-form";
import {
  CareerNotFoundError,
  CareerRepository,
} from "@/modules/career/repository";

export const dynamic = "force-dynamic";

const noticeText: Record<string, string> = {
  created:
    "Entry created. Add proposed facts below, then approve the facts that are accurate.",
  updated: "Entry saved.",
  "status-updated": "Entry status updated.",
  "proposal-created":
    "Proposed fact added. It is not verified or eligible for generation until approved.",
  "fact-approved":
    "Fact approved and assigned an immutable evidence identifier.",
  "proposal-rejected": "Proposal rejected.",
  "fact-corrected":
    "A replacement fact was approved; the previous fact remains in history as superseded.",
  "fact-withdrawn": "Fact withdrawn and excluded from future use.",
  "skill-linked": "Skill linked to this entry.",
};

export default async function CareerEntryPage({
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
  const repository = new CareerRepository(getRuntimePool());
  let data;
  let preview;
  let skills;
  let entrySkills;
  try {
    [data, preview, skills, entrySkills] = await Promise.all([
      repository.getEntry(principal, id),
      repository.dependencyPreview(principal, id),
      repository.listSkills(principal),
      repository.listEntrySkills(principal, id),
    ]);
  } catch (error) {
    if (error instanceof CareerNotFoundError) notFound();
    throw error;
  }
  const { entry, facts, proposals } = data;
  const notice =
    typeof query.notice === "string" ? noticeText[query.notice] : undefined;
  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href="/career">Career Information Bank</Link>{" "}
        <span aria-hidden="true">/</span> {entry.title}
      </nav>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="status-label">{entry.status}</span>
          <h1 className="mt-2 text-3xl font-bold">{entry.title}</h1>
          <p className="mt-1 text-[var(--muted)]">
            {entry.type} · revision {entry.revision}
          </p>
        </div>
        <form action={setCareerEntryArchivedAction}>
          <input type="hidden" name="id" value={entry.id} />
          <input
            type="hidden"
            name="archived"
            value={entry.status === "active" ? "true" : "false"}
          />
          <button className="secondary-button" type="submit">
            {entry.status === "active" ? "Archive entry" : "Restore entry"}
          </button>
        </form>
      </div>
      {notice ? (
        <p role="status" className="notice mt-6">
          {notice}
        </p>
      ) : null}
      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="details-heading"
      >
        <h2 id="details-heading" className="text-xl font-semibold">
          Entry details
        </h2>
        <div className="mt-5">
          <EntryForm entry={entry} action={updateCareerEntryAction} />
        </div>
      </section>

      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="linked-skills-heading"
      >
        <h2 id="linked-skills-heading" className="text-xl font-semibold">
          Linked skills
        </h2>
        {entrySkills.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {entrySkills.map((skill) => (
              <li className="status-label" key={skill.id}>
                {skill.display_name}
                {skill.proficiency ? ` · ${skill.proficiency}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[var(--muted)]">No skills linked.</p>
        )}
        {skills.some((skill) => !skill.archived) ? (
          <form
            action={linkSkillAction}
            className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <input type="hidden" name="entryId" value={entry.id} />
            <label className="grid gap-1 font-medium">
              Skill
              <select className="field" name="skillId">
                {skills
                  .filter((skill) => !skill.archived)
                  .map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.display_name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 font-medium">
              Proficiency
              <select className="field" name="proficiency">
                <option value="">Not specified</option>
                <option value="familiar">Familiar</option>
                <option value="working">Working</option>
                <option value="advanced">Advanced</option>
                <option value="expert">Expert</option>
              </select>
            </label>
            <button className="button self-end" type="submit">
              Link skill
            </button>
          </form>
        ) : (
          <p className="mt-3">
            <Link href="/career">Create a reusable skill first.</Link>
          </p>
        )}
      </section>

      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="propose-heading"
      >
        <h2 id="propose-heading" className="text-xl font-semibold">
          Propose a fact
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Manual claims still require an explicit approval step. Dates use YYYY,
          YYYY-MM, or YYYY-MM-DD.
        </p>
        <div className="mt-5">
          <FactForm
            action={createFactProposalAction}
            entryId={entry.id}
            submitLabel="Add proposal"
          />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="review-heading">
        <h2 id="review-heading" className="text-2xl font-semibold">
          Proposal review
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Pending proposals cannot be used as evidence.
        </p>
        {proposals.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-5">
            No proposals yet.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {proposals.map((proposal) => (
              <li
                key={proposal.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{proposal.display_text}</strong>
                  <span className="status-label">{proposal.status}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Source: {proposal.source_locator.label} · Type:{" "}
                  {proposal.type}
                </p>
                {proposal.status === "pending" ? (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <form action={approveFactProposalAction}>
                      <input type="hidden" name="entryId" value={entry.id} />
                      <input
                        type="hidden"
                        name="proposalId"
                        value={proposal.id}
                      />
                      <button className="button" type="submit">
                        Approve fact
                      </button>
                    </form>
                    <form action={rejectFactProposalAction}>
                      <input type="hidden" name="entryId" value={entry.id} />
                      <input
                        type="hidden"
                        name="proposalId"
                        value={proposal.id}
                      />
                      <button className="secondary-button" type="submit">
                        Reject
                      </button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="facts-heading">
        <h2 id="facts-heading" className="text-2xl font-semibold">
          Evidence facts
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Approved content is immutable. Corrections create a new evidence ID
          and preserve history.
        </p>
        {facts.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-5">
            No approved facts yet.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {facts.map((fact) => (
              <li
                key={fact.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{fact.display_text}</strong>
                  <span className="status-label">{fact.status}</span>
                </div>
                <dl className="mt-3 grid gap-1 text-sm">
                  <div>
                    <dt className="inline font-semibold">Evidence ID: </dt>
                    <dd className="inline break-all">{fact.id}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">Source: </dt>
                    <dd className="inline">
                      {fact.source_locator.label}
                      {fact.source_available ? "" : " (source unavailable)"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">Approved: </dt>
                    <dd className="inline">
                      {fact.approved_at.toISOString().slice(0, 10)}
                    </dd>
                  </div>
                </dl>
                {fact.status === "approved" ? (
                  <div className="mt-5 grid gap-4 border-t border-[var(--border)] pt-5">
                    <details>
                      <summary className="cursor-pointer font-semibold">
                        Correct this fact
                      </summary>
                      <div className="mt-4">
                        <FactForm
                          action={supersedeFactAction}
                          entryId={entry.id}
                          factId={fact.id}
                          submitLabel="Approve corrected fact"
                        />
                      </div>
                    </details>
                    <form action={withdrawFactAction}>
                      <input type="hidden" name="entryId" value={entry.id} />
                      <input type="hidden" name="factId" value={fact.id} />
                      <button className="danger-button" type="submit">
                        Withdraw from future use
                      </button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="mt-10 rounded-xl border border-[var(--danger)] p-5"
        aria-labelledby="delete-heading"
      >
        <h2 id="delete-heading" className="text-xl font-semibold">
          Permanently delete entry
        </h2>
        <p className="mt-2">
          Impact: {preview.facts} facts, {preview.proposals} manual proposals,{" "}
          {preview.skillLinks} skill links, {preview.extractionBatches}{" "}
          extraction batches, {preview.matchingRuns} evidence-matching runs, and{" "}
          {preview.tailoringRuns} tailoring runs will be deleted. This cannot be
          undone.
        </p>
        {preview.documentClaims > 0 ? (
          <p role="alert" className="mt-3 font-semibold">
            This entry supports {preview.documentClaims} saved document{" "}
            {preview.documentClaims === 1 ? "claim" : "claims"}. Permanent
            deletion is unavailable here because saved document history must not
            be removed without a separate document-impact choice. Archive the
            entry to exclude it from future use.
          </p>
        ) : null}
        {query.error === "confirmation" ? (
          <p role="alert" className="mt-3 font-semibold">
            Type DELETE exactly to confirm.
          </p>
        ) : null}
        {query.error === "document-dependency" ? (
          <p role="alert" className="mt-3 font-semibold">
            This entry was linked to saved document history before deletion
            completed. Nothing was deleted. Reload and review the updated
            impact.
          </p>
        ) : null}
        <form
          action={deleteCareerEntryAction}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="id" value={entry.id} />
          <label className="grid gap-1 font-medium">
            Type DELETE
            <input className="field" name="confirmation" autoComplete="off" />
          </label>
          <button
            className="danger-button"
            type="submit"
            disabled={preview.documentClaims > 0}
          >
            Permanently delete
          </button>
        </form>
      </section>
    </main>
  );
}
