import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { DataControls } from "@/modules/portability/components/data-controls";

export const dynamic = "force-dynamic";

export default async function PrivacySettingsPage() {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/sign-in");
  const environment = readServerEnvironment();
  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href="/dashboard">Dashboard</Link>{" "}
        <span aria-hidden="true">/</span> Privacy and data
      </nav>
      <h1 className="mt-5 text-3xl font-bold">Privacy and data controls</h1>
      <p className="mt-2 max-w-3xl text-[var(--muted)]">
        Project telemetry is{" "}
        {environment.TELEMETRY_ENABLED ? "enabled" : "disabled"}. Uploaded and
        generated content is not used for project model training. Remote model
        providers apply their own disclosed retention terms.
      </p>
      <p className="mt-3">
        <Link href="/settings/providers">Review model destinations</Link>
      </p>
      <div className="mt-8">
        <DataControls />
      </div>
    </main>
  );
}
