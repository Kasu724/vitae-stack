import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentPrincipal } from "@/modules/auth/principal";
import { createCareerEntryAction } from "@/modules/career/actions";
import { EntryForm } from "@/modules/career/components/entry-form";

export const dynamic = "force-dynamic";

export default async function NewCareerEntryPage() {
  if (!(await getCurrentPrincipal(await headers()))) redirect("/");
  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href="/career">Career Information Bank</Link>{" "}
        <span aria-hidden="true">/</span> New entry
      </nav>
      <h1 className="mt-5 text-3xl font-bold">Add career entry</h1>
      <p className="mt-2 mb-8 text-[var(--muted)]">
        An entry organizes your history. Add claims separately and approve each
        one before it can ground generated content.
      </p>
      <EntryForm action={createCareerEntryAction} />
    </main>
  );
}
