import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ResourceCardList } from "@/components/resource-card-list";
import { StatusTabs } from "@/components/status-tabs";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  createSkillAction,
  deleteCareerEntriesAction,
  updateCareerSettingsAction,
  updateCareerEntriesStatusAction,
} from "@/modules/career/actions";
import {
  careerSectionForEntryType,
  careerSectionLabels,
  careerSections,
} from "@/modules/career/domain";
import { CareerRepository } from "@/modules/career/repository";

export const dynamic = "force-dynamic";
const pageSize = 25;

export default async function CareerBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const type = typeof params.type === "string" ? params.type : "";
  const status: "active" | "archived" =
    params.status === "archived" ? "archived" : "active";
  const requestedPage =
    typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 10_000)
      : 1;
  const repository = new CareerRepository(getRuntimePool());
  const filters = { query, type, status };
  const [entries, totalEntries, skills, settings] = await Promise.all([
    repository.listEntries(principal, {
      ...filters,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    repository.countEntries(principal, filters),
    repository.listSkills(principal),
    repository.getProfileSettings(principal),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const statusHref = (targetStatus: "active" | "archived") => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (type) next.set("type", type);
    if (targetStatus === "archived") next.set("status", targetStatus);
    const suffix = next.toString();
    return suffix ? "/career?" + suffix : "/career";
  };
  const pageHref = (targetPage: number) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (type) next.set("type", type);
    if (status !== "active") next.set("status", status);
    if (targetPage > 1) next.set("page", String(targetPage));
    const suffix = next.toString();
    return suffix ? "/career?" + suffix : "/career";
  };
  const dependencyPreviews = new Map(
    await Promise.all(
      entries.map(
        async (entry) =>
          [
            entry.id,
            await repository.dependencyPreview(principal, entry.id),
          ] as const,
      ),
    ),
  );
  const groupedEntries = careerSections
    .map((section) => ({
      section,
      entries: entries.filter(
        (entry) => careerSectionForEntryType(entry.type) === section,
      ),
    }))
    .filter((group) => group.entries.length > 0);
  return (
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href="/dashboard">Dashboard</Link>{" "}
        <span aria-hidden="true">/</span> Career Information Bank
      </nav>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Career Information Bank</h1>
          <p className="mt-2 text-[var(--muted)]">
            Only facts you explicitly approve become verified evidence.
          </p>
        </div>
        <Link href="/career/new" className="button">
          Add career entry
        </Link>
      </div>
      {typeof params.notice === "string" ? (
        <p
          role={
            params.notice === "delete-blocked" ||
            params.notice === "delete-unavailable"
              ? "alert"
              : "status"
          }
          className={
            params.notice === "delete-blocked" ||
            params.notice === "delete-unavailable"
              ? "mt-6 rounded-lg border border-[var(--danger)] p-4"
              : "notice mt-6"
          }
        >
          {params.notice === "deleted"
            ? "The selected entries and the dependencies shown in their previews were deleted."
            : params.notice === "delete-blocked"
              ? "At least one selected entry supports saved document history, so none of the selected entries were deleted. Archive it or remove the document dependency first."
              : params.notice === "delete-unavailable"
                ? "The selected entries changed or are no longer available, so none of them were deleted. Reload and review the selection."
                : params.notice === "archived"
                  ? "Selected entries were archived."
                  : params.notice === "restored"
                    ? "Selected entries were restored."
                    : params.notice === "skill-saved"
                      ? "Skill saved."
                      : "Career goals and writing preferences saved."}
        </p>
      ) : null}
      <form
        className="mt-8 grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-[1fr_auto]"
        role="search"
      >
        {status === "archived" ? (
          <input type="hidden" name="status" value="archived" />
        ) : null}
        <label className="grid gap-1 font-medium">
          Search entries and facts
          <input
            className="field"
            type="search"
            name="q"
            defaultValue={query}
          />
        </label>
        <button className="button self-end" type="submit">
          Apply filters
        </button>
      </form>
      <div className="mt-8">
        <StatusTabs
          activeHref={statusHref("active")}
          archivedHref={statusHref("archived")}
          currentStatus={status}
          label="Career entry status"
        />
      </div>
      <p className="mt-5 text-sm text-[var(--muted)]" role="status">
        {totalEntries} {totalEntries === 1 ? "entry" : "entries"}
      </p>
      {entries.length === 0 ? (
        <section className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-8">
          <h2 className="text-xl font-semibold">No matching entries</h2>
          <p className="mt-2 text-[var(--muted)]">
            Create an entry, change the search, or choose the other status tab.
          </p>
        </section>
      ) : (
        <ResourceCardList
          items={groupedEntries.flatMap((group) =>
            group.entries.map((entry) => {
              const preview = dependencyPreviews.get(entry.id)!;
              const dependentCount =
                preview.facts +
                preview.extractionBatches +
                preview.matchingRuns +
                preview.proposals +
                preview.skillLinks +
                preview.tailoringRuns;
              return {
                id: entry.id,
                title: entry.title,
                href: `/career/${entry.id}`,
                status: entry.status,
                category: entry.type,
                group: careerSectionLabels[group.section],
                subtitle: entry.organization || "No organization",
                warning: entry.possible_duplicate
                  ? "Possible duplicate: another item has the same title and organization."
                  : undefined,
                metadata: [
                  `${entry.approved_fact_count} approved facts · ${entry.pending_proposal_count} pending proposals`,
                ],
                tags: entry.tags,
                deleteImpact: [
                  preview.documentClaims > 0
                    ? `${preview.documentClaims} saved document ${preview.documentClaims === 1 ? "claim blocks" : "claims block"} permanent deletion.`
                    : "No saved document claims block permanent deletion.",
                  dependentCount > 0
                    ? `${dependentCount} dependent fact, proposal, skill, extraction, matching, or tailoring records will also be deleted.`
                    : "No dependent records will also be deleted.",
                ],
              };
            }),
          )}
          resourceName="item"
          resourceNamePlural="items"
          headingLevel={3}
          status={status}
          archiveAction={updateCareerEntriesStatusAction}
          deleteAction={deleteCareerEntriesAction}
          deleteWarning="Permanent deletion cannot be undone. If any selected item supports saved document history, the whole selection is blocked and nothing is deleted."
          returnPath={pageHref(page)}
        />
      )}
      {totalPages > 1 ? (
        <nav
          aria-label="Career entry pages"
          className="mt-6 flex flex-wrap items-center gap-4"
        >
          {page > 1 ? (
            <Link className="secondary-button" href={pageHref(page - 1)}>
              Previous page
            </Link>
          ) : null}
          <span>
            Page {Math.min(page, totalPages)} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link className="secondary-button" href={pageHref(page + 1)}>
              Next page
            </Link>
          ) : null}
        </nav>
      ) : null}
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          aria-labelledby="skills-heading"
        >
          <h2 id="skills-heading" className="text-xl font-semibold">
            Skills
          </h2>
          <p className="mt-2 text-[var(--muted)]">
            Reusable skill labels can be linked to career entries.
          </p>
          {skills.length ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {skills.map((skill) => (
                <li className="status-label" key={skill.id}>
                  {skill.display_name}
                  {skill.category ? ` · ${skill.category}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4">No skills saved.</p>
          )}
          <form action={createSkillAction} className="mt-5 grid gap-3">
            <label className="grid gap-1 font-medium">
              Skill name
              <input
                className="field"
                name="displayName"
                required
                maxLength={200}
              />
            </label>
            <label className="grid gap-1 font-medium">
              Category
              <input className="field" name="category" maxLength={200} />
            </label>
            <label className="grid gap-1 font-medium">
              Aliases
              <span className="text-sm font-normal text-[var(--muted)]">
                Comma-separated
              </span>
              <input className="field" name="aliases" />
            </label>
            <button className="button w-fit" type="submit">
              Save skill
            </button>
          </form>
        </section>
        <section
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          aria-labelledby="settings-heading"
        >
          <h2 id="settings-heading" className="text-xl font-semibold">
            Goals and writing preferences
          </h2>
          <form action={updateCareerSettingsAction} className="mt-5 grid gap-4">
            <label className="grid gap-1 font-medium">
              Career goals
              <span className="text-sm font-normal text-[var(--muted)]">
                One per line
              </span>
              <textarea
                className="field"
                rows={4}
                name="careerGoals"
                defaultValue={settings.careerGoals.join("\n")}
              />
            </label>
            <label className="grid gap-1 font-medium">
              Target roles
              <span className="text-sm font-normal text-[var(--muted)]">
                One per line
              </span>
              <textarea
                className="field"
                rows={4}
                name="targetRoles"
                defaultValue={settings.targetRoles.join("\n")}
              />
            </label>
            <label className="grid gap-1 font-medium">
              Writing tone
              <select
                className="field"
                name="tone"
                defaultValue={settings.writingPreferences.tone}
              >
                <option value="direct">Direct</option>
                <option value="formal">Formal</option>
                <option value="warm">Warm</option>
              </select>
            </label>
            <button className="button w-fit" type="submit">
              Save preferences
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
