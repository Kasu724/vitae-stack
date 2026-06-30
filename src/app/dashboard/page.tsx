import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { SignOutButton } from "@/modules/auth/components/sign-out-button";
import { getCurrentPrincipal } from "@/modules/auth/principal";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/sign-in");

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
  if (!account) redirect("/sign-in");

  return (
    <main id="main-content" className="mx-auto max-w-4xl px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            {account.workspace_name}
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Welcome, {account.user_name}
          </h1>
        </div>
        {principal.mode === "password" ? <SignOutButton /> : null}
      </header>
      <section
        className="mt-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
        aria-labelledby="status-heading"
      >
        <h2 id="status-heading" className="text-xl font-semibold">
          Workspace ready
        </h2>
        <p className="mt-3 text-[var(--muted)]">
          Authentication and workspace isolation are active. Build verified,
          reusable evidence before creating career documents.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/career" className="button inline-block">
            Open Career Information Bank
          </Link>
          <Link href="/documents" className="secondary-button inline-block">
            Open document library
          </Link>
          <Link href="/sources" className="secondary-button inline-block">
            Import source documents
          </Link>
          <Link href="/jobs" className="secondary-button inline-block">
            Add a job description
          </Link>
          <Link
            href="/settings/providers"
            className="secondary-button inline-block"
          >
            Configure model providers
          </Link>
        </div>
      </section>
    </main>
  );
}
