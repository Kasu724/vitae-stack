import type { ReactNode } from "react";

import type { ProviderConfigurationSummary } from "@/modules/providers/repository";

import type { ResumeSetupData } from "../repository";

export function JobProviderFields({
  disclosure,
  jobs,
  providerEmptyLabel,
  providers,
}: {
  disclosure: string;
  jobs: ResumeSetupData["jobs"];
  providerEmptyLabel: string;
  providers: ProviderConfigurationSummary[];
}) {
  return (
    <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <legend className="px-2 text-xl font-semibold">Job and provider</legend>
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 font-medium">
          Reviewed job and match run
          <select
            className="field"
            name="jobId"
            required
            disabled={!jobs.length}
          >
            {jobs.length ? (
              jobs.map((job) => (
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
              <option value="">{providerEmptyLabel}</option>
            )}
          </select>
        </label>
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">{disclosure}</p>
    </fieldset>
  );
}

export function ProviderTransmissionPreview({
  children,
  headingId,
}: {
  children: ReactNode;
  headingId: string;
}) {
  return (
    <aside
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-xl font-semibold">
        Provider transmission preview
      </h2>
      <p className="mt-2">
        The destination is the provider host selected above. Starting the run
        sends these data classes:
      </p>
      {children}
      <p className="mt-3 text-sm text-[var(--muted)]">
        Credentials, source files, rejected facts, and unrelated entries are
        excluded. A remote provider applies its own retention and data handling
        terms; choose a local provider to keep model processing on this
        computer.
      </p>
    </aside>
  );
}

export function EntrySelection({
  description,
  entries,
}: {
  description?: string;
  entries: ResumeSetupData["entries"];
}) {
  return (
    <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <legend className="px-2 text-xl font-semibold">
        Included experiences and facts
      </legend>
      {description ? (
        <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
      ) : null}
      {entries.length ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {entries.map((entry) => (
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
  );
}

export function WritingPreferencesFields() {
  return (
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
  );
}
