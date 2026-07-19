import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  assignProviderTaskAction,
  createProviderAction,
  rotateProviderCredentialAction,
  testProviderAction,
  unassignProviderTaskAction,
} from "@/modules/providers/actions";
import { ProviderConfigurationRepository } from "@/modules/providers/repository";
import { ProviderDeleteControl } from "@/modules/providers/components/provider-delete-control";
import { taskRegistry } from "@/modules/providers/task-registry";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  created: "Provider configuration saved. The credential cannot be viewed.",
  rotated: "Provider credential rotated. Test it before use.",
  assigned: "Task model assignment saved.",
  unassigned: "Task model assignment removed.",
  available: "The synthetic capability test passed.",
  deleted: "Provider configuration and its stored credential were deleted.",
};

const errors: Record<string, string> = {
  create:
    "The provider could not be saved. Check the endpoint policy, credential mode, and encryption key.",
  rotate:
    "The credential was not rotated. Reload if the configuration changed, then try again.",
  assign: "The task assignment was not saved. Reload and try again.",
  unassign: "The task assignment was not removed. Reload and try again.",
  unavailable:
    "The provider did not pass the synthetic structured-output test. No career data was sent.",
  "provider-authentication":
    "The provider rejected the credential. Check that this API key belongs to the intended project and has request permission.",
  "provider-rate_limited":
    "Provider tests are temporarily rate limited. Check the project’s API balance and rate limits, then try the synthetic test again shortly.",
  "provider-timeout":
    "The provider did not respond before the synthetic test timed out. Try again, or check the endpoint and network connection.",
  "provider-invalid_request":
    "The provider rejected the synthetic request. The selected model may not support one of the required structured-output settings.",
  "provider-invalid_response":
    "The provider returned a response that did not satisfy the synthetic structured-output test. Check that the selected model supports strict JSON Schema output.",
  "provider-unavailable":
    "The provider endpoint or selected model is unavailable. Check the base URL, model identifier, and the project’s model access.",
  "provider-unavailable-404":
    "The provider returned HTTP 404. The endpoint is reachable, but the selected model is unavailable to the credential currently stored in this provider configuration.",
  "provider-refused":
    "The provider refused the synthetic structured-output test. Try another supported model or review the provider’s safety and access settings.",
  "provider-unknown":
    "The synthetic provider test failed before a safe diagnostic could be determined. Check the endpoint, credential, and model identifier, then try again. No career data was sent.",
  delete:
    "The provider was not deleted. Reload if the configuration changed, then try again.",
  "delete-in-use":
    "This provider is used by saved tailoring or ATS analysis history and cannot be deleted while that history remains.",
};

function providerKindLabel(kind: "openai_compatible" | "ollama"): string {
  return kind === "openai_compatible" ? "OpenAI-compatible" : "Ollama native";
}

function formatTestedAt(value: Date | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function ProviderSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const query = await searchParams;
  const configurations = await new ProviderConfigurationRepository(
    getRuntimePool(),
  ).list(principal);

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href="/dashboard">Dashboard</Link>{" "}
        <span aria-hidden="true">/</span> Model providers
      </nav>
      <h1 className="mt-5 text-3xl font-bold">Model providers</h1>
      <p className="mt-2 max-w-3xl text-[var(--muted)]">
        Configure where selected AI tasks send the minimum required data. Keys
        are server-side and write-only. Public endpoints require HTTPS; local
        endpoints require an operator allowlist.
      </p>
      {typeof query.notice === "string" && messages[query.notice] ? (
        <p
          className="mt-6 rounded-lg border border-[var(--border)] p-4"
          role="status"
        >
          {messages[query.notice]}
        </p>
      ) : null}
      {typeof query.error === "string" && errors[query.error] ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          {errors[query.error]}
        </p>
      ) : null}

      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="add-provider-heading"
      >
        <h2 id="add-provider-heading" className="text-xl font-semibold">
          Add provider
        </h2>
        <form
          action={createProviderAction}
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <label className="grid gap-1 font-medium">
            Display name
            <input className="field" name="label" required maxLength={100} />
          </label>
          <label className="grid gap-1 font-medium">
            Provider type
            <select
              className="field"
              name="kind"
              defaultValue="openai_compatible"
            >
              <option value="openai_compatible">OpenAI-compatible</option>
              <option value="ollama">Ollama native</option>
            </select>
          </label>
          <label className="grid gap-1 font-medium md:col-span-2">
            Base URL
            <input
              className="field"
              name="baseUrl"
              type="url"
              required
              placeholder="https://models.example/v1/"
            />
          </label>
          <label className="grid gap-1 font-medium">
            Credential mode
            <select className="field" name="authType" defaultValue="encrypted">
              <option value="encrypted">Encrypted database credential</option>
              <option value="environment">
                Environment variable reference
              </option>
              <option value="none">No credential</option>
            </select>
          </label>
          <label className="grid gap-1 font-medium">
            Credential (write-only)
            <input
              className="field"
              name="credential"
              type="password"
              autoComplete="new-password"
              maxLength={4096}
            />
          </label>
          <label className="grid gap-1 font-medium md:col-span-2">
            Environment variable name (environment mode only)
            <input
              className="field"
              name="environmentVariableName"
              pattern="AI_PROVIDER_[A-Z0-9_]+"
              placeholder="AI_PROVIDER_OPENAI_KEY"
            />
          </label>
          <button className="button w-fit md:col-span-2" type="submit">
            Save provider
          </button>
        </form>
      </section>

      <section className="mt-10" aria-labelledby="configured-heading">
        <h2 id="configured-heading" className="text-2xl font-semibold">
          Configured providers
        </h2>
        {configurations.length ? (
          <ul className="mt-4 grid gap-6">
            {configurations.map((configuration) => (
              <li
                key={configuration.id}
                className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
              >
                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-xl font-semibold">
                        {configuration.label}
                      </h3>
                      <p className="mt-1 break-all text-sm text-[var(--muted)]">
                        {configuration.base_url}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="status-label">
                        {configuration.status}
                      </span>
                      <ProviderDeleteControl
                        configurationId={configuration.id}
                        expectedRevision={configuration.revision}
                        label={configuration.label}
                        savedHistoryCount={
                          configuration.tailoring_run_count +
                          configuration.ats_report_count
                        }
                      />
                    </div>
                  </div>
                  <dl className="mt-6 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Provider type
                      </dt>
                      <dd className="mt-1 font-medium">
                        {providerKindLabel(configuration.kind)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Credential
                      </dt>
                      <dd className="mt-1 font-medium">
                        {configuration.auth_type === "encrypted"
                          ? `Stored securely ····${configuration.credential_last_four ?? ""}`
                          : configuration.auth_type === "environment"
                            ? `Environment · ${configuration.environment_variable_name}`
                            : "No credential"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Structured output
                      </dt>
                      <dd className="mt-1 font-medium">
                        {configuration.capabilities.structuredOutput
                          ? "Verified"
                          : "Not verified"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Last tested
                      </dt>
                      <dd className="mt-1 font-medium">
                        {configuration.last_tested_at ? (
                          <time
                            dateTime={configuration.last_tested_at.toISOString()}
                          >
                            {formatTestedAt(configuration.last_tested_at)}
                          </time>
                        ) : (
                          "Never"
                        )}
                      </dd>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Assigned task models
                      </dt>
                      <dd className="mt-2">
                        {Object.entries(configuration.task_assignments)
                          .length ? (
                          <ul className="flex flex-wrap gap-2">
                            {Object.entries(configuration.task_assignments)
                              .sort(([left], [right]) =>
                                left.localeCompare(right),
                              )
                              .map(([taskId, model]) => (
                                <li
                                  key={taskId}
                                  className="group relative flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-subtle)] py-1.5 pl-3 pr-1.5"
                                >
                                  <strong>{taskId}</strong>
                                  <span className="text-[var(--muted)]">
                                    {" "}
                                    · {model}
                                  </span>
                                  <form action={unassignProviderTaskAction}>
                                    <input
                                      type="hidden"
                                      name="configurationId"
                                      value={configuration.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="taskId"
                                      value={taskId}
                                    />
                                    <input
                                      type="hidden"
                                      name="expectedRevision"
                                      value={configuration.revision}
                                    />
                                    <button
                                      className="grid size-7 place-items-center rounded-md text-xl leading-none text-[var(--muted)] opacity-0 transition-opacity hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                                      type="submit"
                                      title={`Remove ${taskId} model assignment`}
                                      aria-label={`Remove ${taskId} model assignment`}
                                    >
                                      <span aria-hidden="true">×</span>
                                    </button>
                                  </form>
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <span className="text-[var(--muted)]">
                            No task models assigned
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  {configuration.tailoring_run_count > 0 ? (
                    <p className="mt-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3 text-sm text-[var(--muted-strong)]">
                      Retained because {configuration.tailoring_run_count} saved
                      tailoring{" "}
                      {configuration.tailoring_run_count === 1
                        ? "run references"
                        : "runs reference"}{" "}
                      this provider.
                    </p>
                  ) : null}
                  {configuration.ats_report_count > 0 ? (
                    <p className="mt-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3 text-sm text-[var(--muted-strong)]">
                      Retained because {configuration.ats_report_count} saved AI
                      ATS{" "}
                      {configuration.ats_report_count === 1
                        ? "report references"
                        : "reports reference"}{" "}
                      this provider.
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-4 border-t border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-5 lg:grid-cols-3 sm:p-6">
                  <form
                    action={testProviderAction}
                    className="flex h-full flex-col rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
                  >
                    <input
                      type="hidden"
                      name="configurationId"
                      value={configuration.id}
                    />
                    <h4 className="font-semibold text-[var(--text-strong)]">
                      Test connection
                    </h4>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Sends synthetic data only.
                    </p>
                    <label className="mt-4 grid gap-1 font-medium">
                      Model
                      <input
                        className="field"
                        name="model"
                        required
                        maxLength={200}
                      />
                    </label>
                    <button
                      className="secondary-button mt-6 w-full"
                      type="submit"
                    >
                      Test provider
                    </button>
                  </form>
                  <form
                    action={assignProviderTaskAction}
                    className="flex h-full flex-col rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
                  >
                    <input
                      type="hidden"
                      name="configurationId"
                      value={configuration.id}
                    />
                    <input
                      type="hidden"
                      name="expectedRevision"
                      value={configuration.revision}
                    />
                    <h4 className="font-semibold text-[var(--text-strong)]">
                      Assign model
                    </h4>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Assign one model to selected tasks, or every task at once.
                    </p>
                    <label className="mt-4 grid gap-1 font-medium">
                      Tasks
                      <select
                        className="field min-h-40"
                        name="taskIds"
                        multiple
                        size={6}
                      >
                        {[...taskRegistry.values()].map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.id} — {task.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-3 grid gap-1 font-medium">
                      Model
                      <input
                        className="field"
                        name="model"
                        required
                        maxLength={200}
                      />
                    </label>
                    <button
                      className="secondary-button mt-6 w-full"
                      type="submit"
                      name="assignmentScope"
                      value="selected"
                    >
                      Assign to selected tasks
                    </button>
                    <button
                      className="secondary-button mt-2 w-full"
                      type="submit"
                      name="assignmentScope"
                      value="all"
                    >
                      Assign to all tasks
                    </button>
                  </form>
                  <form
                    action={rotateProviderCredentialAction}
                    className="flex h-full flex-col rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
                  >
                    <input
                      type="hidden"
                      name="configurationId"
                      value={configuration.id}
                    />
                    <input
                      type="hidden"
                      name="expectedRevision"
                      value={configuration.revision}
                    />
                    <h4 className="font-semibold text-[var(--text-strong)]">
                      Rotate credential
                    </h4>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Replaces the credential and requires a new test.
                    </p>
                    <label className="mt-4 grid gap-1 font-medium">
                      New credential
                      <input
                        className="field"
                        name="credential"
                        type="password"
                        autoComplete="new-password"
                        required
                        maxLength={4096}
                      />
                    </label>
                    <button
                      className="secondary-button mt-6 w-full"
                      type="submit"
                    >
                      Rotate credential
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-8">
            No providers configured. Manual features remain available.
          </p>
        )}
      </section>
    </main>
  );
}
