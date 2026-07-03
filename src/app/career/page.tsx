import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import {
  createSkillAction,
  updateCareerSettingsAction,
} from "@/modules/career/actions";
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
  const pageHref = (targetPage: number) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (type) next.set("type", type);
    if (status !== "active") next.set("status", status);
    if (targetPage > 1) next.set("page", String(targetPage));
    const suffix = next.toString();
    return suffix ? "/career?" + suffix : "/career";
  };
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
        <p role="status" className="notice mt-6">
          {params.notice === "deleted"
            ? "The entry and the dependencies shown in its preview were deleted."
            : params.notice === "skill-saved"
              ? "Skill saved."
              : "Career goals and writing preferences saved."}
        </p>
      ) : null}
      <form
        className="mt-8 grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-[1fr_auto_auto]"
        role="search"
      >
        <label className="grid gap-1 font-medium">
          Search entries and facts
          <input
            className="field"
            type="search"
            name="q"
            defaultValue={query}
          />
        </label>
        <label className="grid gap-1 font-medium">
          Status
          <select className="field" name="status" defaultValue={status}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <button className="button self-end" type="submit">
          Apply filters
        </button>
      </form>
      <p className="mt-5 text-sm text-[var(--muted)]" role="status">
        {totalEntries} {totalEntries === 1 ? "entry" : "entries"}
      </p>
      {entries.length === 0 ? (
        <section className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-8">
          <h2 className="text-xl font-semibold">No matching entries</h2>
          <p className="mt-2 text-[var(--muted)]">
            Create an entry or change the search and status filters.
          </p>
        </section>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="status-label">{entry.status}</span>
                <span className="text-sm text-[var(--muted)]">
                  {entry.type}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold">
                <Link href={`/career/${entry.id}`}>{entry.title}</Link>
              </h2>
              <p className="mt-1 text-[var(--muted)]">
                {entry.organization || "No organization"}
              </p>
              {entry.possible_duplicate ? (
                <p className="mt-3 font-semibold">
                  Possible duplicate: another entry has the same title and
                  organization.
                </p>
              ) : null}
              <p className="mt-3 text-sm">
                {entry.approved_fact_count} approved facts ·{" "}
                {entry.pending_proposal_count} pending proposals
              </p>
              {entry.tags.length ? (
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Tags: {entry.tags.join(", ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
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
