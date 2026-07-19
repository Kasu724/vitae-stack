import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { DocumentRepository } from "@/modules/documents/repository";
import { ProviderConfigurationRepository } from "@/modules/providers/repository";
import { startCoverLetterTailoringAction } from "@/modules/tailoring/actions";
import {
  EntrySelection,
  JobProviderFields,
  ProviderTransmissionPreview,
  WritingPreferencesFields,
} from "@/modules/tailoring/components/setup-fields";
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
        invent company details, contacts, salutations, or role facts. A tested
        AI-07/AI-08 model is required; cover-letter generation has no
        deterministic fallback.
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
        <JobProviderFields
          disclosure="The provider receives bounded job text for ID-only planning, then only the selected requirements and approved evidence for each paragraph. Source files, credentials, and unrelated entries are not sent."
          jobs={setup.jobs}
          providerEmptyLabel="No tested AI-07/AI-08 provider"
          providers={providers}
        />
        <ProviderTransmissionPreview headingId="letter-transmission-heading">
          <ul className="mt-3 list-disc space-y-1 pl-6">
            <li>
              Planning receives up to 30,000 characters of reviewed job text,
              current body-block text, reviewed requirements, and eligible
              approved evidence.
            </li>
            <li>
              Each paragraph draft receives only its selected requirements,
              approved fact display text/value, current target block, writing
              preferences, and opaque identifiers; raw job/company prose is not
              sent to the paragraph-drafting task.
            </li>
          </ul>
        </ProviderTransmissionPreview>
        <EntrySelection entries={setup.entries} />
        <WritingPreferencesFields />
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
