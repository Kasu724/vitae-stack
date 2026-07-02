import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { archiveJobAction, reviseJobAction } from "@/modules/jobs/actions";
import { JobNotFoundError, JobRepository } from "@/modules/jobs/repository";
import {
  decideEvidenceMatchAction,
  generateEvidenceMatchesAction,
} from "@/modules/matching/actions";
import { MatchingRepository } from "@/modules/matching/repository";
import { ProviderConfigurationRepository } from "@/modules/providers/repository";
import {
  addManualRequirementAction,
  correctRequirementsAction,
  finalizeRequirementsAction,
  reviseRequirementAction,
  startRequirementAnalysisAction,
} from "@/modules/requirements/actions";
import { RequirementRepository } from "@/modules/requirements/repository";

export const dynamic = "force-dynamic";

export default async function JobPage({
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
  let job;
  try {
    job = await new JobRepository(getRuntimePool()).get(principal, id);
  } catch (error) {
    if (error instanceof JobNotFoundError) notFound();
    throw error;
  }
  const current = job.revisions[0]!;
  const pool = getRuntimePool();
  const [requirementSets, providerConfigurations] = await Promise.all([
    new RequirementRepository(pool).listForJobRevision(principal, current.id),
    new ProviderConfigurationRepository(pool).list(principal),
  ]);
  const requirementSet = requirementSets[0];
  const matchMatrix =
    requirementSet?.status === "reviewed"
      ? await new MatchingRepository(pool).getLatestMatrix(
          principal,
          requirementSet.id,
        )
      : null;
  const aiProviders = providerConfigurations.filter(
    (provider) =>
      provider.status === "available" &&
      provider.capabilities.structuredOutput &&
      provider.task_assignments["AI-02"],
  );
  const notice =
    query.notice === "created"
      ? "The pasted job snapshot was saved."
      : query.notice === "created-from-file"
        ? "The reviewed file text was saved as an immutable job snapshot."
        : query.notice === "created-from-url"
          ? "The safely retrieved public page was saved as an immutable job snapshot."
          : query.notice === "revised"
            ? "A corrected immutable revision was created."
            : query.notice === "status-updated"
              ? "The job status was updated."
              : query.notice === "requirement-draft"
                ? "A requirement draft was created for review."
                : query.notice === "requirement-updated"
                  ? "The requirement review was updated."
                  : query.notice === "requirement-finalized"
                    ? "The reviewed requirements were saved as an immutable revision."
                    : query.notice === "requirement-correction"
                      ? "A correction draft was created from the reviewed requirements."
                      : query.notice === "matches-generated"
                        ? "Deterministic evidence candidates and explicit gaps were generated."
                        : query.notice === "match-updated"
                          ? "The evidence selection was updated."
                          : null;

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href="/jobs">Job descriptions</Link>{" "}
        <span aria-hidden="true">/</span> {job.posting.title}
      </nav>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="status-label">{job.posting.status}</span>
          <h1 className="mt-2 text-3xl font-bold">{job.posting.title}</h1>
          <p className="mt-1 text-[var(--muted)]">
            {job.posting.company || "Company not specified"}
          </p>
        </div>
        <form action={archiveJobAction}>
          <input type="hidden" name="jobId" value={job.posting.id} />
          <input
            type="hidden"
            name="archived"
            value={job.posting.status === "active" ? "true" : "false"}
          />
          <button className="secondary-button" type="submit">
            {job.posting.status === "active" ? "Archive job" : "Restore job"}
          </button>
        </form>
      </div>
      {notice ? (
        <p className="notice mt-6" role="status">
          {notice}
        </p>
      ) : null}
      {query.error === "revision-conflict" ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          The correction was not saved because this job changed or the text was
          invalid. Review the current revision and try again.
        </p>
      ) : null}
      {typeof query.error === "string" &&
      query.error.startsWith("requirement-") ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          {query.error === "requirement-finalize"
            ? "Resolve every proposal and accept at least one requirement before finalizing."
            : query.error === "requirement-analysis"
              ? "The analysis could not create a valid draft. Use deterministic or manual review, or check the selected provider."
              : "The requirement review changed or the submitted value was invalid. Reload and try again."}
        </p>
      ) : null}
      {typeof query.error === "string" &&
      query.error.startsWith("matching-") ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          {query.error === "matching-generate"
            ? "Evidence matching requires a reviewed requirement revision. Review the current requirements and try again."
            : "The evidence selection changed or the fact is no longer eligible. Reload and review it again."}
        </p>
      ) : null}

      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="current-snapshot-heading"
      >
        <div className="flex flex-wrap justify-between gap-2">
          <h2 id="current-snapshot-heading" className="text-xl font-semibold">
            Current normalized snapshot
          </h2>
          <span>Revision {current.revision_number}</span>
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Input: {current.input_method} · Checksum:{" "}
          <code className="break-all">{current.content_hash}</code>
        </p>
        {current.metadata.warnings.length ? (
          <div className="mt-4">
            <h3 className="font-semibold">Warnings</h3>
            <ul className="mt-2 list-disc pl-6">
              {current.metadata.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {current.source_document_id ? (
          <p className="mt-3 text-sm">
            Source:{" "}
            {current.source_available ? (
              <Link href={`/sources/${current.source_document_id}`}>
                {current.metadata.sourceName || "Imported file"}
              </Link>
            ) : (
              "Original source unavailable"
            )}
          </p>
        ) : null}
        <pre className="mt-4 max-h-[45rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 font-sans">
          {current.normalized_text}
        </pre>
      </section>

      {requirementSet?.status === "reviewed" ? (
        <section
          className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          aria-labelledby="evidence-matrix-heading"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="evidence-matrix-heading"
                className="text-xl font-semibold"
              >
                Requirement-to-evidence matrix
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Candidates use approved facts from active entries only. Scores
                are deterministic lexical signals, not proof that a fact
                supports a generated claim.
              </p>
            </div>
            <form action={generateEvidenceMatchesAction}>
              <input type="hidden" name="jobId" value={job.posting.id} />
              <input
                type="hidden"
                name="requirementSetId"
                value={requirementSet.id}
              />
              <button className="secondary-button" type="submit">
                {matchMatrix ? "Recompute candidates" : "Generate candidates"}
              </button>
            </form>
          </div>
          {matchMatrix ? (
            <div className="mt-5">
              <p className="text-sm text-[var(--muted)]" role="status">
                Match revision {matchMatrix.run.revision_number} ·{" "}
                {matchMatrix.run.algorithm_version} ·{" "}
                {matchMatrix.run.eligible_fact_count} eligible facts
              </p>
              <ol className="mt-4 grid gap-5">
                {matchMatrix.requirements.map((requirement, index) => (
                  <li
                    key={requirement.id}
                    className="rounded-lg border border-[var(--border)] p-4"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <h3 className="font-semibold">
                        {index + 1}. {requirement.requirement_text}
                      </h3>
                      <span className="status-label">
                        {requirement.candidates.length
                          ? `${requirement.candidates.length} candidates`
                          : "gap"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {requirement.category.replaceAll("_", " ")} ·{" "}
                      {requirement.priority}
                    </p>
                    {requirement.candidates.length ? (
                      <ul className="mt-4 grid gap-3">
                        {requirement.candidates.map((candidate) => {
                          const eligible =
                            candidate.fact_status === "approved" &&
                            candidate.entry_status === "active";
                          return (
                            <li
                              key={candidate.id}
                              className="rounded-md bg-[var(--background)] p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium">
                                    {candidate.display_text}
                                  </p>
                                  <p className="mt-1 text-sm text-[var(--muted)]">
                                    Evidence {candidate.evidence_fact_id} ·{" "}
                                    {candidate.fact_type} · source{" "}
                                    {candidate.source_locator.label}
                                  </p>
                                </div>
                                <span className="status-label">
                                  {candidate.strength}
                                </span>
                              </div>
                              <p className="mt-2 text-sm">
                                {candidate.reason} Score{" "}
                                {(candidate.score_basis_points / 100).toFixed(
                                  0,
                                )}
                                %.
                              </p>
                              <p className="mt-1 text-sm text-[var(--muted)]">
                                Signals:{" "}
                                {candidate.signals.matchedTokens.join(", ") ||
                                  "no lexical terms"}
                              </p>
                              {!eligible ? (
                                <p className="mt-2 text-sm text-[var(--danger)]">
                                  This fact is no longer eligible and cannot be
                                  included in a new tailoring run.
                                </p>
                              ) : null}
                              <div className="mt-3 flex flex-wrap items-center gap-3">
                                <Link
                                  href={`/career/${candidate.career_entry_id}`}
                                  className="secondary-button"
                                >
                                  Inspect evidence
                                </Link>
                                <form action={decideEvidenceMatchAction}>
                                  <input
                                    type="hidden"
                                    name="jobId"
                                    value={job.posting.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="matchId"
                                    value={candidate.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="decision"
                                    value="included"
                                  />
                                  <button
                                    className="secondary-button"
                                    type="submit"
                                    disabled={
                                      !eligible ||
                                      candidate.current_decision === "included"
                                    }
                                  >
                                    {candidate.current_decision === "included"
                                      ? "Included"
                                      : "Include"}
                                  </button>
                                </form>
                                <form action={decideEvidenceMatchAction}>
                                  <input
                                    type="hidden"
                                    name="jobId"
                                    value={job.posting.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="matchId"
                                    value={candidate.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="decision"
                                    value="excluded"
                                  />
                                  <button
                                    className="secondary-button"
                                    type="submit"
                                    disabled={
                                      candidate.current_decision === "excluded"
                                    }
                                  >
                                    {candidate.current_decision === "excluded"
                                      ? "Excluded"
                                      : "Exclude"}
                                  </button>
                                </form>
                                {candidate.current_decision ? (
                                  <span className="text-sm" role="status">
                                    User decision: {candidate.current_decision}
                                  </span>
                                ) : (
                                  <span className="text-sm text-[var(--muted)]">
                                    Not yet selected
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-4 rounded-md border border-dashed border-[var(--border)] p-4">
                        No approved evidence met the deterministic candidate
                        threshold. Keep this as an explicit gap or add and
                        approve genuine career evidence.
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="mt-5 rounded-lg border border-dashed border-[var(--border)] p-5">
              No match run exists for this reviewed requirement revision.
              Generate candidates to see evidence and explicit gaps.
            </p>
          )}
        </section>
      ) : null}

      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="requirements-heading"
      >
        <h2 id="requirements-heading" className="text-xl font-semibold">
          Job requirements
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Extracted items are proposals until you accept or reject each one and
          finalize the review. Imported instructions are treated only as data.
        </p>
        {!requirementSet ? (
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <form
              action={startRequirementAnalysisAction}
              className="grid gap-2"
            >
              <input type="hidden" name="jobId" value={job.posting.id} />
              <input type="hidden" name="method" value="deterministic" />
              <h3 className="font-semibold">Deterministic line analysis</h3>
              <p className="text-sm text-[var(--muted)]">
                Creates bounded, explainable line proposals without sending data
                to a model.
              </p>
              <button className="secondary-button w-fit" type="submit">
                Analyze without AI
              </button>
            </form>
            <form
              action={startRequirementAnalysisAction}
              className="grid gap-2"
            >
              <input type="hidden" name="jobId" value={job.posting.id} />
              <input type="hidden" name="method" value="manual" />
              <h3 className="font-semibold">Manual review</h3>
              <p className="text-sm text-[var(--muted)]">
                Start with an empty review and enter requirements yourself.
              </p>
              <button className="secondary-button w-fit" type="submit">
                Enter manually
              </button>
            </form>
            <form
              action={startRequirementAnalysisAction}
              className="grid gap-2"
            >
              <input type="hidden" name="jobId" value={job.posting.id} />
              <input type="hidden" name="method" value="ai" />
              <h3 className="font-semibold">Configured model</h3>
              <label className="grid gap-1 font-medium">
                Provider and assigned model
                <select
                  className="field"
                  name="providerConfigurationId"
                  required
                  disabled={!aiProviders.length}
                >
                  {aiProviders.length ? (
                    aiProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label} — {provider.task_assignments["AI-02"]}
                      </option>
                    ))
                  ) : (
                    <option value="">No tested AI-02 provider</option>
                  )}
                </select>
              </label>
              <button
                className="button w-fit"
                type="submit"
                disabled={!aiProviders.length}
              >
                Analyze with model
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>
                <span className="status-label">{requirementSet.status}</span>{" "}
                Revision {requirementSet.revision_number} ·{" "}
                {requirementSet.method}
              </p>
              <span className="text-sm text-[var(--muted)]">
                {
                  requirementSet.requirements.filter(
                    (item) => item.decision === "accepted",
                  ).length
                }{" "}
                accepted
              </span>
            </div>
            {requirementSet.metadata.warnings.length ? (
              <ul className="mt-3 list-disc pl-6 text-sm text-[var(--muted)]">
                {requirementSet.metadata.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {requirementSet.requirements.length ? (
              <ol className="mt-5 grid gap-4">
                {requirementSet.requirements.map((requirement, index) => (
                  <li
                    key={requirement.id}
                    className="rounded-lg border border-[var(--border)] p-4"
                  >
                    {requirementSet.status === "draft" ? (
                      <form
                        action={reviseRequirementAction}
                        className="grid gap-3"
                      >
                        <input
                          type="hidden"
                          name="jobId"
                          value={job.posting.id}
                        />
                        <input
                          type="hidden"
                          name="setId"
                          value={requirementSet.id}
                        />
                        <input
                          type="hidden"
                          name="requirementId"
                          value={requirement.id}
                        />
                        <label className="grid gap-1 font-medium">
                          Requirement {index + 1}
                          <textarea
                            className="field min-h-24"
                            name="requirementText"
                            required
                            maxLength={2000}
                            defaultValue={requirement.requirement_text}
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className="grid gap-1 font-medium">
                            Category
                            <select
                              className="field"
                              name="category"
                              defaultValue={requirement.category}
                            >
                              {[
                                "required_qualification",
                                "preferred_qualification",
                                "responsibility",
                                "keyword",
                                "seniority",
                                "ambiguity",
                              ].map((value) => (
                                <option key={value} value={value}>
                                  {value.replaceAll("_", " ")}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 font-medium">
                            Priority
                            <select
                              className="field"
                              name="priority"
                              defaultValue={requirement.priority}
                            >
                              {["required", "preferred", "informational"].map(
                                (value) => (
                                  <option key={value}>{value}</option>
                                ),
                              )}
                            </select>
                          </label>
                          <label className="grid gap-1 font-medium">
                            Decision
                            <select
                              className="field"
                              name="decision"
                              defaultValue={requirement.decision}
                            >
                              {["proposed", "accepted", "rejected"].map(
                                (value) => (
                                  <option key={value}>{value}</option>
                                ),
                              )}
                            </select>
                          </label>
                        </div>
                        {requirement.source_text ? (
                          <p className="rounded-md bg-[var(--background)] p-3 text-sm">
                            Source {requirement.source_start}–
                            {requirement.source_end}: “{requirement.source_text}
                            ”
                          </p>
                        ) : (
                          <p className="text-sm text-[var(--muted)]">
                            Manually entered; no source span.
                          </p>
                        )}
                        <button
                          className="secondary-button w-fit"
                          type="submit"
                        >
                          Save review decision
                        </button>
                      </form>
                    ) : requirement.decision === "accepted" ? (
                      <div>
                        <p className="font-semibold">
                          {requirement.requirement_text}
                        </p>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {requirement.category.replaceAll("_", " ")} ·{" "}
                          {requirement.priority}
                        </p>
                        {requirement.source_text ? (
                          <p className="mt-2 rounded-md bg-[var(--background)] p-3 text-sm">
                            Source: “{requirement.source_text}”
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-[var(--muted)]">
                        Rejected proposal retained in immutable review history.
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-[var(--border)] p-5">
                No proposals. Add a requirement manually.
              </p>
            )}
            {requirementSet.status === "draft" ? (
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <form
                  action={addManualRequirementAction}
                  className="grid gap-3 rounded-lg border border-[var(--border)] p-4"
                >
                  <input type="hidden" name="jobId" value={job.posting.id} />
                  <input type="hidden" name="setId" value={requirementSet.id} />
                  <h3 className="font-semibold">Add manual requirement</h3>
                  <label className="grid gap-1 font-medium">
                    Requirement
                    <textarea
                      className="field min-h-24"
                      name="requirementText"
                      required
                      maxLength={2000}
                    />
                  </label>
                  <label className="grid gap-1 font-medium">
                    Category
                    <select className="field" name="category">
                      <option value="required_qualification">
                        required qualification
                      </option>
                      <option value="preferred_qualification">
                        preferred qualification
                      </option>
                      <option value="responsibility">responsibility</option>
                      <option value="keyword">keyword</option>
                      <option value="seniority">seniority</option>
                      <option value="ambiguity">ambiguity</option>
                    </select>
                  </label>
                  <label className="grid gap-1 font-medium">
                    Priority
                    <select className="field" name="priority">
                      <option value="required">required</option>
                      <option value="preferred">preferred</option>
                      <option value="informational">informational</option>
                    </select>
                  </label>
                  <button className="secondary-button w-fit" type="submit">
                    Add accepted requirement
                  </button>
                </form>
                <form
                  action={finalizeRequirementsAction}
                  className="grid content-start gap-3 rounded-lg border border-[var(--border)] p-4"
                >
                  <input type="hidden" name="jobId" value={job.posting.id} />
                  <input type="hidden" name="setId" value={requirementSet.id} />
                  <h3 className="font-semibold">Finalize review</h3>
                  <p className="text-sm text-[var(--muted)]">
                    Every proposal must be accepted or rejected. Finalizing
                    makes this revision immutable.
                  </p>
                  <button className="button w-fit" type="submit">
                    Finalize reviewed requirements
                  </button>
                </form>
              </div>
            ) : (
              <form action={correctRequirementsAction} className="mt-5">
                <input type="hidden" name="jobId" value={job.posting.id} />
                <input type="hidden" name="setId" value={requirementSet.id} />
                <button className="secondary-button" type="submit">
                  Create correction revision
                </button>
              </form>
            )}
            {requirementSets.length > 1 ? (
              <details className="mt-6">
                <summary className="cursor-pointer font-semibold">
                  View earlier requirement revisions
                </summary>
                <ol className="mt-3 grid gap-3">
                  {requirementSets.slice(1).map((set) => (
                    <li
                      key={set.id}
                      className="rounded-lg border border-[var(--border)] p-4"
                    >
                      <strong>
                        Revision {set.revision_number} · {set.status}
                      </strong>
                      <ul className="mt-2 list-disc pl-6">
                        {set.requirements
                          .filter((item) => item.decision === "accepted")
                          .map((item) => (
                            <li key={item.id}>{item.requirement_text}</li>
                          ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </div>
        )}
      </section>

      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="correct-job-heading"
      >
        <h2 id="correct-job-heading" className="text-xl font-semibold">
          Correct the snapshot
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Saving creates a new immutable child revision. Existing revisions are
          never overwritten.
        </p>
        <form action={reviseJobAction} className="mt-4 grid gap-4">
          <input type="hidden" name="jobId" value={job.posting.id} />
          <input type="hidden" name="currentRevisionId" value={current.id} />
          <label className="grid gap-1 font-medium">
            Corrected job description
            <textarea
              className="field min-h-72"
              name="jobText"
              defaultValue={current.normalized_text}
              required
              maxLength={500000}
            />
          </label>
          <button className="button w-fit" type="submit">
            Create corrected revision
          </button>
        </form>
      </section>

      <section className="mt-8" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-2xl font-semibold">
          Revision history
        </h2>
        <ol className="mt-4 grid gap-3">
          {job.revisions.map((revision) => (
            <li
              key={revision.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <strong>Revision {revision.revision_number}</strong>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {revision.input_method} · {revision.created_at.toISOString()} ·{" "}
                <span className="break-all">{revision.content_hash}</span>
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer font-semibold">
                  View snapshot
                </summary>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--border)] p-3 font-sans">
                  {revision.normalized_text}
                </pre>
              </details>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
