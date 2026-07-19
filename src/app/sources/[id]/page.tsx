import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  startAiExtractionAction,
  startExtractionAction,
} from "@/modules/extraction/actions";
import { deleteSourceAction } from "@/modules/ingestion/actions";
import { createJobFromSourceAction } from "@/modules/jobs/actions";
import {
  SourceNotFoundError,
  SourceRepository,
} from "@/modules/ingestion/source-repository";
import { SourceService } from "@/modules/ingestion/source-service";
import { ProviderConfigurationRepository } from "@/modules/providers/repository";

export const dynamic = "force-dynamic";

export default async function SourcePage({
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
  const pool = getRuntimePool();
  const repository = new SourceRepository(pool);
  const service = new SourceService(repository, readServerEnvironment());
  let source;
  try {
    await service.refreshSidecarResult(principal, id);
    source = await repository.get(principal, id);
  } catch (error) {
    if (error instanceof SourceNotFoundError) notFound();
    throw error;
  }
  const aiProviders = await new ProviderConfigurationRepository(
    pool,
  ).listReadyForTask(principal, "AI-01");
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
      {query.error === "ai-extraction" ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          AI extraction did not produce a valid proposal batch. No partial model
          output was saved. Try the deterministic review path or check the
          selected provider.
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
            {source.purpose === "resume" ? (
              <div className="mt-5 border-t border-[var(--border)] pt-5">
                <h3 className="text-lg font-semibold">
                  Score this uploaded resume
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Run AI ATS analysis directly on this parsed source, with or
                  without an optional reviewed job source. This does not approve
                  facts or create a document.
                </p>
                <Link
                  className="secondary-button mt-4 inline-block"
                  href={`/ats?sourceId=${source.id}`}
                >
                  Analyze uploaded resume
                </Link>
              </div>
            ) : null}
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
                  Extract structured career items
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  AI extraction is recommended because it separates the source
                  into sections and distinct items, then keeps every field and
                  bullet tied to its item. Nothing is approved automatically.
                </p>
                <div className="mt-6 border-t border-[var(--border)] pt-5">
                  <h4 className="font-semibold">
                    Recommended: structured AI extraction
                  </h4>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    AI can classify exact source spans into career entries and
                    facts, but it cannot approve them. The local application
                    validates every returned span before saving pending
                    proposals.
                  </p>
                  {aiProviders.length ? (
                    <form
                      action={startAiExtractionAction}
                      className="mt-4 grid gap-3"
                    >
                      <input type="hidden" name="sourceId" value={source.id} />
                      <label className="grid gap-1 font-medium">
                        AI extraction provider
                        <select
                          className="field"
                          name="providerConfigurationId"
                          required
                        >
                          {aiProviders.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                              {provider.label} —{" "}
                              {provider.task_assignments["AI-01"]} —{" "}
                              {new URL(provider.base_url).origin}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="rounded-lg border border-[var(--border)] p-3 text-sm">
                        Transmission preview: the full extracted source text,
                        AI-01 instructions, and the output schema will be sent
                        to the selected destination. Provider authentication may
                        be sent separately as a transport header. Original file
                        bytes, career-bank data, and content from other
                        documents are not included. A remote provider may retain
                        or process the text under its own policy.
                      </p>
                      <button className="button w-fit" type="submit">
                        Extract structured proposals with AI
                      </button>
                    </form>
                  ) : (
                    <p className="mt-3 text-sm text-[var(--muted)]">
                      No tested provider has an AI-01 model assignment. The
                      deterministic fallback below remains available.{" "}
                      <Link href="/settings/providers">
                        Configure model providers
                      </Link>
                      .
                    </p>
                  )}
                </div>
                <details className="mt-6 rounded-lg border border-[var(--border)] p-4">
                  <summary className="cursor-pointer font-semibold">
                    Use deterministic fallback
                  </summary>
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    The local fallback recognizes common resume section headings
                    and blank-line item boundaries. Its grouping is heuristic,
                    so review every proposed item and fact carefully.
                  </p>
                  <form action={startExtractionAction} className="mt-4">
                    <input type="hidden" name="sourceId" value={source.id} />
                    <button className="secondary-button" type="submit">
                      Extract without AI
                    </button>
                  </form>
                </details>
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
          This deletes the stored binary and extracted text. Pending proposals,
          completed review decisions, and approved evidence remain, with the
          source marked unavailable. This cannot be undone.
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
            Delete source bytes
          </button>
        </form>
      </section>
    </main>
  );
}
