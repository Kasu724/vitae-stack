import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { generateAtsReportAction } from "@/modules/ats/actions";
import { AtsInputNotFoundError, AtsRepository } from "@/modules/ats/repository";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { DocumentRepository } from "@/modules/documents/repository";

export const dynamic = "force-dynamic";

export default async function AtsSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const query = await searchParams;
  const documentId =
    typeof query.documentId === "string" ? query.documentId : null;
  const pool = getRuntimePool();

  if (!documentId) {
    const documents = await new DocumentRepository(pool).list(principal);
    return (
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <nav aria-label="Breadcrumb">
          <Link href="/dashboard">Dashboard</Link>{" "}
          <span aria-hidden="true">/</span> ATS analysis
        </nav>
        <h1 className="mt-5 text-3xl font-bold">Estimated ATS compatibility</h1>
        <p className="mt-2 max-w-3xl text-[var(--muted)]">
          Choose an active document. The report applies deterministic,
          explainable rules; it does not reproduce a proprietary ATS or predict
          an employer decision.
        </p>
        {documents.length ? (
          <ul className="mt-6 grid gap-3">
            {documents.map((document) => (
              <li
                key={document.id}
                className="rounded-lg border border-[var(--border)] p-4"
              >
                <Link href={`/ats?documentId=${document.id}`}>
                  {document.title}
                </Link>{" "}
                <span className="text-sm text-[var(--muted)]">
                  ({document.kind === "resume" ? "resume" : "cover letter"})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-6">
            No active document exists.{" "}
            <Link href="/documents">Create one.</Link>
          </p>
        )}
      </main>
    );
  }

  let setup;
  try {
    setup = await new AtsRepository(pool).getSetup(principal, documentId);
  } catch (error) {
    if (error instanceof AtsInputNotFoundError) redirect("/ats");
    throw error;
  }

  return (
    <main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href={`/documents/${documentId}`}>{setup.document.title}</Link>{" "}
        <span aria-hidden="true">/</span> ATS analysis
      </nav>
      <h1 className="mt-5 text-3xl font-bold">Estimated ATS compatibility</h1>
      <p className="mt-2 max-w-3xl text-[var(--muted)]">
        This immutable report evaluates the current document version against a
        reviewed job snapshot, explicit evidence-match decisions, and the
        current claim/evidence graph. Identical inputs reuse the same report.
      </p>
      {query.error === "invalid-input" ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          The report could not be generated. Confirm the document is active and
          the job has reviewed requirements plus an evidence-match run.
        </p>
      ) : null}
      <form action={generateAtsReportAction} className="mt-8 grid gap-5">
        <input type="hidden" name="documentId" value={documentId} />
        <label className="grid gap-1 font-medium">
          Reviewed job and evidence matches
          <select
            className="field"
            name="jobId"
            required
            disabled={!setup.jobs.length}
          >
            {setup.jobs.length ? (
              setup.jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                  {job.company ? ` — ${job.company}` : ""}
                </option>
              ))
            ) : (
              <option value="">No eligible job</option>
            )}
          </select>
        </label>
        {!setup.jobs.length ? (
          <p className="notice">
            Analyze and review a job, generate evidence matches, and include or
            exclude relevant matches before running this report. Go to the{" "}
            <Link href="/jobs">job library</Link>.
          </p>
        ) : null}
        <button
          className="button w-fit"
          type="submit"
          disabled={!setup.jobs.length}
        >
          Generate deterministic report
        </button>
      </form>
      <p className="mt-8 text-sm text-[var(--muted)]">
        No document or job content is sent to an AI provider for scoring.
      </p>
    </main>
  );
}
