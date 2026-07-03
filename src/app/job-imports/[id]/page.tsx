import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  JobUrlImportNotFoundError,
  JobUrlImportRepository,
} from "@/modules/job-fetch/repository";
import { JobUrlImportService } from "@/modules/job-fetch/service";
import { JobRepository } from "@/modules/jobs/repository";

export const dynamic = "force-dynamic";

const failureMessages: Record<string, string> = {
  NONPUBLIC_ADDRESS: "The hostname resolved to an address that is not public.",
  TOO_MANY_REDIRECTS: "The page exceeded the safe redirect limit.",
  FETCH_TIMEOUT: "The public page did not respond within the time limit.",
  RESPONSE_TOO_LARGE: "The page exceeded the safe content-size limit.",
  EXTRACTED_TEXT_TOO_LARGE: "The extracted job text exceeded the safe limit.",
  UNSUPPORTED_CONTENT_TYPE: "The page did not return HTML or plain text.",
  EMPTY_CONTENT: "No usable static job-description text was found.",
  UPSTREAM_STATUS: "The public page returned an unsupported response.",
};

export default async function JobUrlImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const { id } = await params;
  const imports = new JobUrlImportRepository(getRuntimePool());
  let record;
  try {
    record = await new JobUrlImportService(
      imports,
      new JobRepository(getRuntimePool()),
      readServerEnvironment(),
    ).refresh(principal, id);
  } catch (error) {
    if (error instanceof JobUrlImportNotFoundError) notFound();
    throw error;
  }
  if (record.status === "succeeded" && record.job_posting_id)
    redirect(`/jobs/${record.job_posting_id}?notice=created-from-url`);

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href="/jobs">Job descriptions</Link>{" "}
        <span aria-hidden="true">/</span> URL import
      </nav>
      <span className="status-label mt-5">{record.status}</span>
      <h1 className="mt-2 text-3xl font-bold">Public job-page import</h1>
      {record.status === "pending" ? (
        <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-xl font-semibold">Fetch in progress</h2>
          <p className="mt-2" role="status">
            The isolated fetcher is validating and retrieving the public page.
            No cookies or user credentials are sent.
          </p>
          <Link
            className="secondary-button mt-4 inline-block"
            href={`/job-imports/${id}`}
          >
            Check status
          </Link>
        </section>
      ) : (
        <section className="mt-6 rounded-xl border border-[var(--danger)] p-5">
          <h2 className="text-xl font-semibold">
            The URL could not be imported
          </h2>
          <p className="mt-2" role="alert">
            {failureMessages[record.error_code ?? ""] ??
              "The page failed the safe retrieval policy or could not be processed."}
          </p>
          <p className="mt-3 text-[var(--muted)]">
            No job snapshot was created. Paste the description or upload a
            supported file instead.
          </p>
          <Link className="secondary-button mt-4 inline-block" href="/jobs">
            Return to job input
          </Link>
        </section>
      )}
    </main>
  );
}
