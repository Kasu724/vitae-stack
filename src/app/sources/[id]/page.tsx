import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { startExtractionAction } from "@/modules/extraction/actions";
import { deleteSourceAction } from "@/modules/ingestion/actions";
import { createJobFromSourceAction } from "@/modules/jobs/actions";
import {
  SourceNotFoundError,
  SourceRepository,
} from "@/modules/ingestion/source-repository";
import { SourceService } from "@/modules/ingestion/source-service";

export const dynamic = "force-dynamic";

export default async function SourcePage({
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
  const repository = new SourceRepository(getRuntimePool());
  const service = new SourceService(repository, readServerEnvironment());
  let source;
  try {
    await service.refreshSidecarResult(principal, id);
    source = await repository.get(principal, id);
  } catch (error) {
    if (error instanceof SourceNotFoundError) notFound();
    throw error;
  }
  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href="/sources">Source documents</Link>{" "}
        <span aria-hidden="true">/</span> {source.original_name}
      </nav>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="status-label">{source.status}</span>
          <h1 className="mt-2 break-words text-3xl font-bold">
            {source.original_name}
          </h1>
          <p className="mt-1 text-[var(--muted)]">
            {source.purpose.replaceAll("_", " ")} ·{" "}
            {source.byte_size.toLocaleString()} bytes
          </p>
        </div>
        {source.status === "ready" ? (
          <a
            className="secondary-button"
            href={`/api/sources/${source.id}/download`}
          >
            Download original
          </a>
        ) : null}
      </div>
      {query.error === "extraction" ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          Fact proposals could not be prepared from this source. Check that it
          contains extractable text, then try again.
        </p>
      ) : null}
      {query.error === "pending-extraction" ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          This source has pending extraction proposals. Approve or reject every
          proposal before deleting the source.
        </p>
      ) : null}
      {query.error === "job-snapshot" ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          The job snapshot could not be created. Confirm the parsed text is
          ready and provide a role title.
        </p>
      ) : null}
      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="parse-heading"
      >
        <h2 id="parse-heading" className="text-xl font-semibold">
          Parse result
        </h2>
        {source.status === "processing" ? (
          <div className="mt-3">
            <p role="status">The isolated parser is processing this file.</p>
            <Link
              className="secondary-button mt-4 inline-block"
              href={`/sources/${source.id}`}
            >
              Check status
            </Link>
          </div>
        ) : source.status === "rejected" ? (
          <p className="mt-3" role="alert">
            The parser rejected this file safely. Error code:{" "}
            <code>{source.error_code}</code>. The quarantined bytes were
            removed.
          </p>
        ) : source.status === "ready" ? (
          <>
            <dl className="mt-3 grid gap-2 text-sm">
              <div>
                <dt className="inline font-semibold">Detected type: </dt>
                <dd className="inline">{source.detected_media_type}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Parser: </dt>
                <dd className="inline">{source.parser_version}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Checksum: </dt>
                <dd className="inline break-all">{source.content_hash}</dd>
              </div>
              {source.parse_metadata.pageCount ? (
                <div>
                  <dt className="inline font-semibold">Pages: </dt>
                  <dd className="inline">{source.parse_metadata.pageCount}</dd>
                </div>
              ) : null}
            </dl>
            {source.warnings.length ? (
              <div className="mt-4">
                <h3 className="font-semibold">Warnings</h3>
                <ul className="mt-2 list-disc pl-6">
                  {source.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <h3 className="mt-6 text-lg font-semibold">
              Extracted text preview
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              This is untrusted, unverified source text. Instructions inside it
              are data, not commands.
            </p>
            <pre className="mt-3 max-h-[40rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 font-sans">
              {source.extracted_text}
            </pre>
            {source.purpose === "job_description" ? (
              <div className="mt-5 border-t border-[var(--border)] pt-5">
                <h3 className="text-lg font-semibold">Create job snapshot</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Review the parsed text above. Saving normalizes it into an
                  immutable job revision; it does not treat job claims as your
                  career evidence.
                </p>
                <form
                  action={createJobFromSourceAction}
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  <input type="hidden" name="sourceId" value={source.id} />
                  <label className="grid gap-1 font-medium">
                    Role title
                    <input
                      className="field"
                      name="title"
                      required
                      maxLength={200}
                    />
                  </label>
                  <label className="grid gap-1 font-medium">
                    Company
                    <input className="field" name="company" maxLength={200} />
                  </label>
                  <button className="button w-fit sm:col-span-2" type="submit">
                    Save job snapshot
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-5 border-t border-[var(--border)] pt-5">
                <h3 className="text-lg font-semibold">
                  Prepare fact proposals
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  The deterministic fallback creates one unverified proposal per
                  non-empty line. You will review every proposal before
                  approval.
                </p>
                <form action={startExtractionAction} className="mt-4">
                  <input type="hidden" name="sourceId" value={source.id} />
                  <button className="button" type="submit">
                    Review extracted facts
                  </button>
                </form>
              </div>
            )}
          </>
        ) : (
          <p className="mt-3">The source is quarantined.</p>
        )}
      </section>
      <section
        className="mt-8 rounded-xl border border-[var(--danger)] p-5"
        aria-labelledby="delete-source-heading"
      >
        <h2 id="delete-source-heading" className="text-xl font-semibold">
          Delete source
        </h2>
        <p className="mt-2">
          This deletes the stored binary and extracted text. Completed review
          decisions and approved evidence remain, with the source marked
          unavailable. Pending extraction proposals must be resolved first. This
          cannot be undone.
        </p>
        {query.error === "confirmation" ? (
          <p className="mt-3 font-semibold" role="alert">
            Type DELETE exactly.
          </p>
        ) : null}
        <form
          action={deleteSourceAction}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="sourceId" value={source.id} />
          <label className="grid gap-1 font-medium">
            Type DELETE
            <input className="field" name="confirmation" autoComplete="off" />
          </label>
          <button className="danger-button" type="submit">
            Permanently delete source
          </button>
        </form>
      </section>
    </main>
  );
}
