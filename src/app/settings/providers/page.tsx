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
} from "@/modules/providers/actions";
import { ProviderConfigurationRepository } from "@/modules/providers/repository";
import { taskRegistry } from "@/modules/providers/task-registry";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  created: "Provider configuration saved. The credential cannot be viewed.",
  rotated: "Provider credential rotated. Test it before use.",
  assigned: "Task model assignment saved.",
  available: "The synthetic capability test passed.",
};

const errors: Record<string, string> = {
  create:
    "The provider could not be saved. Check the endpoint policy, credential mode, and encryption key.",
  rotate:
    "The credential was not rotated. Reload if the configuration changed, then try again.",
  assign: "The task assignment was not saved. Reload and try again.",
  unavailable:
    "The provider did not pass the synthetic structured-output test. No career data was sent.",
};

export default async function ProviderSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/sign-in");
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
          <ul className="mt-4 grid gap-5">
            {configurations.map((configuration) => (
              <li
                key={configuration.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">
                      {configuration.label}
                    </h3>
                    <p className="mt-1 break-all text-sm text-[var(--muted)]">
                      {configuration.base_url}
                    </p>
                  </div>
                  <span className="status-label">{configuration.status}</span>
                </div>
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold">Type</dt>
                    <dd>{configuration.kind}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Credential</dt>
                    <dd>
                      {configuration.auth_type === "encrypted"
                        ? `Stored securely, ending ${configuration.credential_last_four ?? "unknown"}`
                        : configuration.auth_type === "environment"
                          ? `Environment reference ${configuration.environment_variable_name}`
                          : "None"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Structured output</dt>
                    <dd>
                      {configuration.capabilities.structuredOutput
                        ? "Verified"
                        : "Not verified"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Last tested</dt>
                    <dd>
                      {configuration.last_tested_at?.toISOString() ?? "Never"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-5 grid gap-5 lg:grid-cols-3">
                  <form action={testProviderAction} className="grid gap-2">
                    <input
                      type="hidden"
                      name="configurationId"
                      value={configuration.id}
                    />
                    <label className="grid gap-1 font-medium">
                      Model for synthetic test
                      <input
                        className="field"
                        name="model"
                        required
                        maxLength={200}
                      />
                    </label>
                    <button className="secondary-button w-fit" type="submit">
                      Test provider
                    </button>
                  </form>
                  <form
                    action={assignProviderTaskAction}
                    className="grid gap-2"
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
                    <label className="grid gap-1 font-medium">
                      Task
                      <select className="field" name="taskId">
                        {[...taskRegistry.values()].map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.id} — {task.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 font-medium">
                      Assigned model
                      <input
                        className="field"
                        name="model"
                        required
                        maxLength={200}
                      />
                    </label>
                    <button className="secondary-button w-fit" type="submit">
                      Assign model
                    </button>
                  </form>
                  <form
                    action={rotateProviderCredentialAction}
                    className="grid gap-2"
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
                    <label className="grid gap-1 font-medium">
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
                    <button className="secondary-button w-fit" type="submit">
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
