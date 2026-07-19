import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { generateAtsReportAction } from "@/modules/ats/actions";
import { AtsInputNotFoundError, AtsRepository } from "@/modules/ats/repository";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { DocumentRepository } from "@/modules/documents/repository";
import { SourceRepository } from "@/modules/ingestion/source-repository";
import { ProviderConfigurationRepository } from "@/modules/providers/repository";

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
  const sourceId = typeof query.sourceId === "string" ? query.sourceId : null;
  const pool = getRuntimePool();

  if (!documentId && !sourceId) {
    const [allDocuments, sources] = await Promise.all([
      new DocumentRepository(pool).list(principal),
      new SourceRepository(pool).list(principal),
    ]);
    const documents = allDocuments.filter(
      (document) => document.kind === "resume",
    );
    const resumeSources = sources.filter(
      (source) => source.purpose === "resume" && source.status === "ready",
    );
    return (
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <nav aria-label="Breadcrumb">
          <Link href="/dashboard">Dashboard</Link>{" "}
          <span aria-hidden="true">/</span> ATS analysis
        </nav>
        <h1 className="mt-5 text-3xl font-bold">AI ATS analysis</h1>
        <p className="mt-2 max-w-3xl text-[var(--muted)]">
          Choose a resume or parsed resume upload. A configured AI model creates
          the analysis, either with or without an optional reviewed job source.
          The result does not reproduce a proprietary ATS or predict an employer
          decision.
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
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-6">
            No active resume exists. <Link href="/documents">Create one.</Link>
          </p>
        )}
        <section className="mt-8" aria-labelledby="uploaded-resumes-heading">
          <h2 id="uploaded-resumes-heading" className="text-xl font-semibold">
            Uploaded resumes
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Analyze parsed resume text directly with AI. This does not create a
            saved document or approve facts as evidence.
          </p>
          {resumeSources.length ? (
            <ul className="mt-4 grid gap-3">
              {resumeSources.map((source) => (
                <li
                  key={source.id}
                  className="rounded-lg border border-[var(--border)] p-4"
                >
                  <Link href={`/ats?sourceId=${source.id}`}>
                    {source.original_name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-[var(--border)] p-4">
              No ready resume upload exists.{" "}
              <Link href="/sources">Upload a resume.</Link>
            </p>
          )}
        </section>
      </main>
    );
  }

  const providerRepository = new ProviderConfigurationRepository(pool);
  const providers = await providerRepository.listReadyForTask(
    principal,
    "AI-11",
  );
  const providerField = (
    <label className="grid gap-1 font-medium">
      AI provider and assigned model
      <select
        className="field"
        name="providerConfigurationId"
        required
        disabled={!providers.length}
      >
        {providers.length ? (
          providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label} — {provider.task_assignments["AI-11"]}
            </option>
          ))
        ) : (
          <option value="">No provider assigned to AI-11</option>
        )}
      </select>
    </label>
  );
  const providerNotice = !providers.length ? (
    <p className="notice">
      Configure and test an AI provider, then assign its model to AI-11 ATS
      analysis in <Link href="/settings/providers">provider settings</Link>.
    </p>
  ) : null;

  if (sourceId) {
    let setup;
    try {
      setup = await new AtsRepository(pool).getSourceSetup(principal, sourceId);
    } catch (error) {
      if (error instanceof AtsInputNotFoundError) redirect("/ats");
      throw error;
    }
    return (
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <nav aria-label="Breadcrumb">
          <Link href={`/sources/${sourceId}`}>
            {setup.source.original_name}
          </Link>{" "}
          <span aria-hidden="true">/</span> ATS analysis
        </nav>
        <h1 className="mt-5 text-3xl font-bold">
          AI ATS analysis for uploaded resume
        </h1>
        <p className="mt-2 max-w-3xl text-[var(--muted)]">
          The selected AI provider receives the parsed resume text and, if you
          choose one, the reviewed job source. Job alignment is optional.
        </p>
        {query.error === "invalid-input" ? (
          <p
            className="mt-6 rounded-lg border border-[var(--danger)] p-4"
            role="alert"
          >
            The AI analysis could not be generated. Confirm the resume, job,
            provider assignment, and model availability, then try again.
          </p>
        ) : null}
        <form action={generateAtsReportAction} className="mt-8 grid gap-5">
          <input type="hidden" name="sourceId" value={sourceId} />
          {providerField}
          <label className="grid gap-1 font-medium">
            Optional reviewed job source
            <select className="field" name="jobId">
              <option value="">No job — general resume analysis</option>
              {setup.jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                  {job.company ? ` — ${job.company}` : ""}
                </option>
              ))}
            </select>
          </label>
          {providerNotice}
          <button
            className="button w-fit"
            type="submit"
            disabled={!providers.length}
          >
            Generate AI analysis
          </button>
        </form>
        <p className="mt-8 text-sm text-[var(--muted)]">
          This sends parsed resume text and optional job text to the selected
          provider. Review its destination and privacy terms before continuing.
        </p>
      </main>
    );
  }

  if (!documentId) redirect("/ats");
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
      <h1 className="mt-5 text-3xl font-bold">AI ATS analysis</h1>
      <p className="mt-2 max-w-3xl text-[var(--muted)]">
        The selected AI provider evaluates the current resume version, either
        generally or against an optional reviewed job source. Identical inputs,
        provider, and model reuse the same immutable report.
      </p>
      {query.error === "invalid-input" ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          The AI analysis could not be generated. Confirm the resume, optional
          job, provider assignment, and model availability, then try again.
        </p>
      ) : null}
      <form action={generateAtsReportAction} className="mt-8 grid gap-5">
        <input type="hidden" name="documentId" value={documentId} />
        {providerField}
        <label className="grid gap-1 font-medium">
          Optional reviewed job source
          <select className="field" name="jobId">
            <option value="">No job — general resume analysis</option>
            {setup.jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
                {job.company ? ` — ${job.company}` : ""}
              </option>
            ))}
          </select>
        </label>
        {providerNotice}
        <button
          className="button w-fit"
          type="submit"
          disabled={!providers.length}
        >
          Generate AI analysis
        </button>
      </form>
      <p className="mt-8 text-sm text-[var(--muted)]">
        This sends resume text and optional job text to the selected provider.
        Review its destination and privacy terms before continuing.
      </p>
    </main>
  );
}
