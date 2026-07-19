import Link from "next/link";

import type { AtsReportView, SourceAtsReportView } from "../repository";

type Report = AtsReportView["report"] | SourceAtsReportView["report"];

interface AtsReportContentProps {
  analyzeHref: string;
  analyzeLabel: string;
  backHref: string;
  backLabel: string;
  categories: AtsReportView["categories"];
  findingSurface?: boolean;
  findings: AtsReportView["findings"];
  notice: string;
  report: Report;
  resumeIdentity: { label: string; value: string };
  showCreatedAt?: boolean;
  subject: string;
}

function percent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(basisPoints % 100 ? 2 : 0)}%`;
}

export function AtsReportContent({
  analyzeHref,
  analyzeLabel,
  backHref,
  backLabel,
  categories,
  findingSurface = false,
  findings,
  notice,
  report,
  resumeIdentity,
  showCreatedAt = false,
  subject,
}: AtsReportContentProps) {
  return (
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href={backHref}>{backLabel}</Link>{" "}
        <span aria-hidden="true">/</span> AI ATS analysis
      </nav>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">AI ATS analysis</h1>
          <p className="mt-2 text-[var(--muted)]">
            {subject}
            {report.job_title
              ? ` for ${report.job_title}${report.job_company ? ` at ${report.job_company}` : ""}`
              : " without a job source"}
          </p>
        </div>
        <Link className="secondary-button" href={analyzeHref}>
          {analyzeLabel}
        </Link>
      </div>

      <p className="notice mt-6">{notice}</p>

      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <strong className="block text-sm text-[var(--muted)]">
          Overall AI estimate
        </strong>
        <span className="text-3xl font-bold">
          {report.overall_score_basis_points === null
            ? "Not provided"
            : percent(report.overall_score_basis_points)}
        </span>
        {report.analysis_summary ? (
          <p className="mt-4">{report.analysis_summary}</p>
        ) : null}
        {report.overall_rationale ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            {report.overall_rationale}
          </p>
        ) : null}
      </section>

      <section className="mt-10" aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="text-2xl font-semibold">
          AI category assessments
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {categories.map((category) => (
            <article
              key={category.category}
              className="rounded-xl border border-[var(--border)] p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{category.label}</h3>
                <span className="status-label">
                  {category.score_basis_points === null
                    ? "Not provided"
                    : percent(category.score_basis_points)}
                </span>
              </div>
              {category.rationale ? (
                <p className="mt-3 text-sm">{category.rationale}</p>
              ) : null}
              <p className="mt-3 text-xs text-[var(--muted)]">
                AI-assigned weight: {category.weight}%
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="findings-heading">
        <h2 id="findings-heading" className="text-2xl font-semibold">
          AI findings
        </h2>
        {findings.length ? (
          <ol className="mt-4 grid gap-4">
            {findings.map((finding) => (
              <li
                key={finding.id}
                className={`rounded-xl border border-[var(--border)] p-5${findingSurface ? " bg-[var(--surface)]" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">{finding.category}</h3>
                  <span className="status-label">{finding.severity}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Location: {String(finding.location.hint ?? "Resume")}
                </p>
                <p className="mt-3">{finding.message}</p>
                <p className="mt-2">
                  <strong>Recommended action:</strong> {finding.remediation}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="notice mt-4">
            The model returned no specific findings.
          </p>
        )}
      </section>

      <section
        className="mt-10 rounded-xl border border-[var(--border)] p-5"
        aria-labelledby="provenance-heading"
      >
        <h2 id="provenance-heading" className="text-2xl font-semibold">
          Analysis provenance
        </h2>
        <dl className="mt-4 grid gap-2 text-sm">
          <div>
            <dt className="font-semibold">Provider and model</dt>
            <dd>
              {report.provider_label ?? "Historical report"}
              {" \u00b7 "}
              {report.model ?? "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Task version</dt>
            <dd>{report.task_version ?? report.ruleset_version}</dd>
          </div>
          {showCreatedAt ? (
            <div>
              <dt className="font-semibold">Created</dt>
              <dd>{report.created_at.toISOString()}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-semibold">{resumeIdentity.label}</dt>
            <dd className="break-all">{resumeIdentity.value}</dd>
          </div>
          <div>
            <dt className="font-semibold">Job source hash</dt>
            <dd className="break-all">{report.job_hash ?? "No job source"}</dd>
          </div>
          <div>
            <dt className="font-semibold">Input hash</dt>
            <dd className="break-all">{report.input_hash}</dd>
          </div>
          <div>
            <dt className="font-semibold">Validated output hash</dt>
            <dd className="break-all">
              {report.output_hash ?? "Historical report"}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
