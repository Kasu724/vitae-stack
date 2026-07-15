import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { DocumentRepository } from "@/modules/documents/repository";
import { ProviderConfigurationRepository } from "@/modules/providers/repository";
import { startResumeTailoringAction } from "@/modules/tailoring/actions";
import {
  TailoringNotFoundError,
  TailoringRepository,
} from "@/modules/tailoring/repository";

export const dynamic = "force-dynamic";

export default async function ResumeTailoringSetupPage({
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
    const resumes = (await new DocumentRepository(pool).list(principal)).filter(
      (document) => document.kind === "resume",
    );
    return (
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <nav aria-label="Breadcrumb">
          <Link href="/dashboard">Dashboard</Link>{" "}
          <span aria-hidden="true">/</span> Resume tailoring
        </nav>
        <h1 className="mt-5 text-3xl font-bold">Choose a source resume</h1>
        {resumes.length ? (
          <ul className="mt-6 grid gap-3">
            {resumes.map((resume) => (
              <li
                key={resume.id}
                className="rounded-lg border border-[var(--border)] p-4"
              >
                <Link href={`/tailoring/resume?documentId=${resume.id}`}>
                  {resume.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-6">
            No active resume exists.{" "}
            <Link href="/documents">Create one in the document library.</Link>
          </p>
        )}
      </main>
    );
  }
  let setup;
  try {
    setup = await new TailoringRepository(pool).getResumeSetup(
      principal,
      documentId,
    );
  } catch (error) {
    if (error instanceof TailoringNotFoundError) redirect("/tailoring/resume");
    throw error;
  }
  const providers = (
    await new ProviderConfigurationRepository(pool).list(principal)
  ).filter(
    (provider) =>
      provider.status === "available" &&
      provider.capabilities.structuredOutput &&
      provider.task_assignments["AI-05"] &&
      provider.task_assignments["AI-06"],
  );

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href={`/documents/${documentId}`}>{setup.document.title}</Link>{" "}
        <span aria-hidden="true">/</span> Tailoring setup
      </nav>
      <h1 className="mt-5 text-3xl font-bold">Tailor resume</h1>
      <p className="mt-2 max-w-3xl text-[var(--muted)]">
        This creates reviewable suggestions against the pinned current version.
        It does not change the resume. Only explicitly included strong evidence
        matches from selected entries are sent to the configured provider. A
        tested AI-05/AI-06 model is required; resume generation has no
        deterministic fallback.
      </p>
      {query.error === "invalid-setup" ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          The run could not start. Confirm the job has reviewed requirements,
          included strong evidence matches, selected active entries, a tested
          AI-05/AI-06 provider, and current lock hashes.
        </p>
      ) : null}
      <form action={startResumeTailoringAction} className="mt-8 grid gap-7">
        <input type="hidden" name="documentId" value={documentId} />
        <input
          type="hidden"
          name="idempotencyKey"
          value={crypto.randomUUID()}
        />
        <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <legend className="px-2 text-xl font-semibold">
            Job and provider
          </legend>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 font-medium">
              Reviewed job and match run
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
            <label className="grid gap-1 font-medium">
              Model provider
              <select
                className="field"
                name="providerConfigurationId"
                required
                disabled={!providers.length}
              >
                {providers.length ? (
                  providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label} — {new URL(provider.base_url).host}
                    </option>
                  ))
                ) : (
                  <option value="">No tested AI-05/AI-06 provider</option>
                )}
              </select>
            </label>
          </div>
          <p className="mt-3 text-sm text-[var(--muted)]">
            The selected provider receives bounded job text, selected evidence,
            current block text, requirements, preferences, and opaque IDs. No
            credentials, unrelated career entries, or source files are sent.
          </p>
        </fieldset>
        <aside
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          aria-labelledby="resume-transmission-heading"
        >
          <h2
            id="resume-transmission-heading"
            className="text-xl font-semibold"
          >
            Provider transmission preview
          </h2>
          <p className="mt-2">
            The destination is the provider host selected above. Starting the
            run sends these data classes:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-6">
            <li>Up to 30,000 characters of the reviewed job snapshot.</li>
            <li>
              Current section metadata and up to 10 eligible current block
              texts.
            </li>
            <li>
              Reviewed requirements and approved bullets or detailed context,
              grouped by checked career item and restricted to explicitly
              included strong matches (up to 40,000 characters total).
            </li>
            <li>Selected tone, target length, and opaque local identifiers.</li>
          </ul>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Credentials, source files, rejected facts, and unrelated entries are
            excluded. A remote provider applies its own retention and data
            handling terms; choose a local provider to keep model processing on
            this computer.
          </p>
        </aside>
        <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <legend className="px-2 text-xl font-semibold">
            Included experiences and facts
          </legend>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Facts are further restricted to evidence matches you explicitly
            included. Clear an entry to exclude all of its facts.
          </p>
          {setup.entries.length ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {setup.entries.map((entry) => (
                <li key={entry.id}>
                  <label className="flex gap-3 rounded-lg border border-[var(--border)] p-3">
                    <input
                      type="checkbox"
                      name="entryId"
                      value={entry.id}
                      defaultChecked
                    />
                    <span>
                      <strong>{entry.title}</strong>
                      <br />
                      <span className="text-sm text-[var(--muted)]">
                        {entry.type}
                        {entry.organization ? ` · ${entry.organization}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4">No active career entries are available.</p>
          )}
        </fieldset>
        <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <legend className="px-2 text-xl font-semibold">
            Writing preferences
          </legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 font-medium">
              Tone
              <select className="field" name="tone">
                <option value="direct">Direct</option>
                <option value="formal">Formal</option>
                <option value="warm">Warm</option>
              </select>
            </label>
            <label className="grid gap-1 font-medium">
              Target length
              <select className="field" name="targetLength">
                <option value="standard">Standard</option>
                <option value="concise">Concise</option>
              </select>
            </label>
          </div>
        </fieldset>
        <button
          className="button w-fit"
          type="submit"
          disabled={
            !setup.jobs.length || !providers.length || !setup.entries.length
          }
        >
          Create reviewable suggestions
        </button>
      </form>
    </main>
  );
}
