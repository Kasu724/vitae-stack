import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ResourceCardList } from "@/components/resource-card-list";
import { StatusTabs } from "@/components/status-tabs";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  createPastedJobAction,
  createUrlJobAction,
  deleteJobsAction,
  updateJobsStatusAction,
} from "@/modules/jobs/actions";
import { JobRepository } from "@/modules/jobs/repository";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const query = await searchParams;
  const status = query.status === "archived" ? "archived" : "active";
  const repository = new JobRepository(getRuntimePool());
  const jobs = await repository.list(principal, status);
  const dependencyPreviews = new Map(
    await Promise.all(
      jobs.map(
        async (job) =>
          [
            job.id,
            await repository.dependencyPreview(principal, job.id),
          ] as const,
      ),
    ),
  );

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href="/dashboard">Dashboard</Link>{" "}
        <span aria-hidden="true">/</span> Jobs
      </nav>
      <h1 className="mt-5 text-3xl font-bold">Job descriptions</h1>
      <p className="mt-2 text-[var(--muted)]">
        Save an immutable normalized snapshot before requirement analysis or
        tailoring. Imported instructions remain untrusted data.
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
            ? "The selected jobs and the deletable analysis shown in their previews were deleted."
            : query.notice === "delete-blocked"
              ? "At least one selected job supports an accepted document version, so none of the selected jobs were deleted. Archive it to preserve document provenance."
              : query.notice === "delete-unavailable"
                ? "The selected jobs changed or are no longer available, so none of them were deleted. Reload and review the selection."
                : `Selected jobs were ${query.notice}.`}
        </p>
      ) : null}
      {query.error === "invalid-text" ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          The pasted job description was empty or exceeded the documented text
          limits, so no snapshot was saved. Correct or paste the text again.
        </p>
      ) : null}
      {query.error === "url-blocked" ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          This URL cannot be fetched under the public HTTPS policy. Paste the
          description or upload a supported file instead.
        </p>
      ) : null}
      {query.error === "url-rate" ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          The workspace hourly URL-import limit was reached. Try again later or
          paste the description.
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          aria-labelledby="paste-job-heading"
        >
          <h2 id="paste-job-heading" className="text-xl font-semibold">
            Paste text
          </h2>
          <form action={createPastedJobAction} className="mt-4 grid gap-4">
            <input
              type="hidden"
              name="idempotencyKey"
              value={crypto.randomUUID()}
            />
            <label className="grid gap-1 font-medium">
              Role title
              <input className="field" name="title" required maxLength={200} />
            </label>
            <label className="grid gap-1 font-medium">
              Company
              <input className="field" name="company" maxLength={200} />
            </label>
            <label className="grid gap-1 font-medium">
              Job description
              <textarea
                className="field min-h-72"
                name="jobText"
                required
                maxLength={500000}
              />
            </label>
            <button className="button w-fit" type="submit">
              Save job snapshot
            </button>
          </form>
        </section>

        <section
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          aria-labelledby="url-job-heading"
        >
          <h2 id="url-job-heading" className="text-xl font-semibold">
            Public HTTPS URL
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Only compatible static public pages are fetched. No cookies,
            logged-in browser, scripts, or subresources are used.
          </p>
          <form action={createUrlJobAction} className="mt-4 grid gap-4">
            <input
              type="hidden"
              name="idempotencyKey"
              value={crypto.randomUUID()}
            />
            <label className="grid gap-1 font-medium">
              Role title
              <input className="field" name="title" required maxLength={200} />
            </label>
            <label className="grid gap-1 font-medium">
              Company
              <input className="field" name="company" maxLength={200} />
            </label>
            <label className="grid gap-1 font-medium">
              Job URL
              <input
                className="field"
                name="jobUrl"
                type="url"
                inputMode="url"
                placeholder="https://example.com/job"
                required
              />
            </label>
            <button className="button w-fit" type="submit">
              Fetch public job page
            </button>
          </form>
        </section>

        <section
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          aria-labelledby="file-job-heading"
        >
          <h2 id="file-job-heading" className="text-xl font-semibold">
            Import a file
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            PDF, DOCX, Markdown, and plain-text files use the same isolated,
            bounded parser as career sources. Review the parsed text before
            creating the job snapshot.
          </p>
          <form
            action="/api/sources"
            method="post"
            encType="multipart/form-data"
            className="mt-4 grid gap-4"
          >
            <input type="hidden" name="purpose" value="job_description" />
            <label className="grid gap-1 font-medium">
              Job-description file
              <input
                className="field"
                type="file"
                name="file"
                required
                accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
              />
            </label>
            <button className="button w-fit" type="submit">
              Upload and review file
            </button>
          </form>
        </section>
      </div>

      <section className="mt-10" aria-labelledby="saved-jobs-heading">
        <h2 id="saved-jobs-heading" className="text-2xl font-semibold">
          Saved jobs
        </h2>
        <div className="mt-5">
          <StatusTabs
            activeHref="/jobs"
            archivedHref="/jobs?status=archived"
            currentStatus={status}
            label="Saved job status"
          />
        </div>
        <p className="mt-4 text-sm text-[var(--muted)]" role="status">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
        </p>
        {jobs.length ? (
          <ResourceCardList
            items={jobs.map((job) => {
              const preview = dependencyPreviews.get(job.id)!;
              const deletableDependents =
                preview.requirementSets +
                preview.matchingRuns +
                preview.tailoringRuns +
                preview.atsReports +
                preview.urlImports;
              return {
                id: job.id,
                title: job.title,
                href: `/jobs/${job.id}`,
                status: job.status,
                category: `Revision ${job.current_revision_number}`,
                subtitle: job.company || "Company not specified",
                deleteImpact: [
                  preview.acceptedDocumentVersions > 0
                    ? `${preview.acceptedDocumentVersions} accepted document ${preview.acceptedDocumentVersions === 1 ? "version blocks" : "versions block"} permanent deletion.`
                    : "No accepted document versions block permanent deletion.",
                  `${preview.revisions} immutable job ${preview.revisions === 1 ? "revision" : "revisions"} and ${deletableDependents} requirement, matching, tailoring, ATS, or URL-import records will also be deleted.`,
                ],
              };
            })}
            resourceName="job"
            resourceNamePlural="jobs"
            headingLevel={3}
            status={status}
            archiveAction={updateJobsStatusAction}
            deleteAction={deleteJobsAction}
            deleteWarning="Permanent deletion cannot be undone. If any selected job supports an accepted document version, the whole selection is blocked and nothing is deleted. Uploaded source files remain separately managed in Sources."
            returnPath={
              status === "archived" ? "/jobs?status=archived" : "/jobs"
            }
          />
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-8">
            No {status} job descriptions. Paste text or import a file above.
          </p>
        )}
      </section>
    </main>
  );
}
