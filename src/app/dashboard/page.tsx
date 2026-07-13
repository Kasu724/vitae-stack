import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");

  const result = await getRuntimePool().query<{
    user_name: string;
    workspace_name: string;
  }>(
    `SELECT users.name AS user_name, workspaces.name AS workspace_name
     FROM workspace_memberships
     JOIN users ON users.id = workspace_memberships.user_id
     JOIN workspaces ON workspaces.id = workspace_memberships.workspace_id
     WHERE workspace_memberships.user_id = $1
       AND workspace_memberships.workspace_id = $2`,
    [principal.userId, principal.workspaceId],
  );
  const account = result.rows[0];
  if (!account) redirect("/");

  return (
    <main
      id="main-content"
      className="mx-auto max-w-6xl px-4 py-10 sm:px-8 lg:py-14"
    >
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-[var(--action)]">
          Personal workspace · {account.workspace_name}
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
          Welcome to Vitae Stack
        </h1>
        <p className="mt-3 text-lg text-[var(--muted)]">
          Build reusable evidence first, then create and assess documents with a
          clear record of where each factual claim came from.
        </p>
      </header>

      <div className="dashboard-grid mt-10">
        <section
          className="dashboard-panel dashboard-panel-primary"
          aria-labelledby="evidence-heading"
        >
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--action)]">
            Recommended starting point
          </p>
          <h2 id="evidence-heading" className="mt-2 text-xl font-semibold">
            Build your evidence library
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Approved facts become immutable evidence. Imported facts stay out of
            generation until you review them.
          </p>
          <Link href="/career" className="button mt-5">
            Open Career Information Bank
          </Link>
          <ul className="dashboard-link-list">
            <li>
              <Link href="/sources">Import source documents</Link>
            </li>
            <li>
              <Link href="/jobs">Add a job description</Link>
            </li>
          </ul>
        </section>

        <section
          className="dashboard-panel"
          aria-labelledby="documents-heading"
        >
          <h2 id="documents-heading" className="text-xl font-semibold">
            Documents & analysis
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Work from immutable versions and keep final exports grounded in
            current approved evidence.
          </p>
          <ul className="dashboard-link-list">
            <li>
              <Link href="/documents">Open document library</Link>
            </li>
            <li>
              <Link href="/ats">Run estimated ATS analysis</Link>
            </li>
            <li>
              <Link href="/exports">Export a document</Link>
            </li>
          </ul>
        </section>

        <section className="dashboard-panel" aria-labelledby="controls-heading">
          <h2 id="controls-heading" className="text-xl font-semibold">
            Privacy & controls
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Your records stay in this installation. Model providers are optional
            and their destinations remain explicit.
          </p>
          <ul className="dashboard-link-list">
            <li>
              <Link href="/settings/providers">Configure model providers</Link>
            </li>
            <li>
              <Link href="/settings/privacy">Privacy and data controls</Link>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
