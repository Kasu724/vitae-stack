import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { DocumentRepository } from "@/modules/documents/repository";
import { ProviderConfigurationRepository } from "@/modules/providers/repository";
import { startCoverLetterTailoringAction } from "@/modules/tailoring/actions";
import {
  TailoringNotFoundError,
  TailoringRepository,
} from "@/modules/tailoring/repository";

export const dynamic = "force-dynamic";

export default async function CoverLetterTailoringSetupPage({
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
    const letters = (await new DocumentRepository(pool).list(principal)).filter(
      (document) => document.kind === "cover_letter",
    );
    return (
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <nav aria-label="Breadcrumb">
          <Link href="/dashboard">Dashboard</Link>{" "}
          <span aria-hidden="true">/</span> Cover-letter tailoring
        </nav>
        <h1 className="mt-5 text-3xl font-bold">
          Choose a source cover letter
        </h1>
        {letters.length ? (
          <ul className="mt-6 grid gap-3">
            {letters.map((letter) => (
              <li
                key={letter.id}
                className="rounded-lg border border-[var(--border)] p-4"
              >
                <Link href={`/tailoring/cover-letter?documentId=${letter.id}`}>
                  {letter.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-6">
            No active cover letter exists.{" "}
            <Link href="/documents">Create one in the document library.</Link>
          </p>
        )}
      </main>
    );
  }
  let setup;
  try {
    setup = await new TailoringRepository(pool).getCoverLetterSetup(
      principal,
      documentId,
    );
  } catch (error) {
    if (error instanceof TailoringNotFoundError)
      redirect("/tailoring/cover-letter");
    throw error;
  }
  const providers = (
    await new ProviderConfigurationRepository(pool).list(principal)
  ).filter(
    (provider) =>
      provider.status === "available" &&
      provider.capabilities.structuredOutput &&
      provider.task_assignments["AI-07"] &&
      provider.task_assignments["AI-08"],
  );

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href={`/documents/${documentId}`}>{setup.document.title}</Link>{" "}
        <span aria-hidden="true">/</span> Tailoring setup
      </nav>
      <h1 className="mt-5 text-3xl font-bold">Tailor cover letter</h1>
      <p className="mt-2 max-w-3xl text-[var(--muted)]">
        This creates reviewable evidence-bearing body-paragraph suggestions
        against the pinned current version. It does not change the letter or
        invent company details, contacts, salutations, or role facts.
      </p>
      {query.error === "invalid-setup" ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          The run could not start. Confirm the reviewed job, included strong
          evidence, selected active entries, unlocked body paragraph, and tested
          AI-07/AI-08 provider.
        </p>
      ) : null}
      <form
        action={startCoverLetterTailoringAction}
        className="mt-8 grid gap-7"
      >
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
                  <option value="">No tested AI-07/AI-08 provider</option>
                )}
              </select>
            </label>
          </div>
          <p className="mt-3 text-sm text-[var(--muted)]">
            The provider receives bounded job text for ID-only planning, then
            only the selected requirements and approved evidence for each
            paragraph. Source files, credentials, and unrelated entries are not
            sent.
          </p>
        </fieldset>
        <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <legend className="px-2 text-xl font-semibold">
            Included experiences and facts
          </legend>
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
          Create reviewable paragraphs
        </button>
      </form>
    </main>
  );
}
