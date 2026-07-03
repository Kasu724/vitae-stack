import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  createPastedJobAction,
  createUrlJobAction,
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
  const jobs = await new JobRepository(getRuntimePool()).list(
    principal,
    status,
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="saved-jobs-heading" className="text-2xl font-semibold">
              Saved jobs
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]" role="status">
              {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
            </p>
          </div>
          <Link
            className="secondary-button"
            href={`/jobs?status=${status === "active" ? "archived" : "active"}`}
          >
            Show {status === "active" ? "archived" : "active"}
          </Link>
        </div>
        {jobs.length ? (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="status-label">{job.status}</span>
                  <span>Revision {job.current_revision_number}</span>
                </div>
                <h3 className="mt-3 text-xl font-semibold">
                  <Link href={`/jobs/${job.id}`}>{job.title}</Link>
                </h3>
                <p className="mt-1 text-[var(--muted)]">
                  {job.company || "Company not specified"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-8">
            No {status} job descriptions. Paste text or import a file above.
          </p>
        )}
      </section>
    </main>
  );
}
