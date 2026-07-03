import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getRuntimePool } from "@/infrastructure/database/runtime";
import { AtsInputNotFoundError, AtsRepository } from "@/modules/ats/repository";
import { getCurrentPrincipal } from "@/modules/auth/principal";

export const dynamic = "force-dynamic";

function percent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(basisPoints % 100 ? 2 : 0)}%`;
}

function json(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

export default async function AtsReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const { id } = await params;
  let view;
  try {
    view = await new AtsRepository(getRuntimePool()).getReport(principal, id);
  } catch (error) {
    if (error instanceof AtsInputNotFoundError) notFound();
    throw error;
  }
  const report = view.report;

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href={`/documents/${report.document_id}`}>
          {report.document_title}
        </Link>{" "}
        <span aria-hidden="true">/</span> Estimated ATS report
      </nav>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Estimated ATS compatibility</h1>
          <p className="mt-2 text-[var(--muted)]">
            {report.document_title} for {report.job_title}
            {report.job_company ? ` at ${report.job_company}` : ""}
          </p>
        </div>
        <Link
          className="secondary-button"
          href={`/ats?documentId=${report.document_id}`}
        >
          Analyze current version
        </Link>
      </div>

      <section
        className="mt-8 grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-3"
        aria-labelledby="summary-heading"
      >
        <h2 id="summary-heading" className="sr-only">
          Report summary
        </h2>
        <div>
          <strong className="block text-sm text-[var(--muted)]">
            Overall estimate
          </strong>
          <span className="text-3xl font-bold">
            {report.overall_score_basis_points === null
              ? "Not shown"
              : percent(report.overall_score_basis_points)}
          </span>
        </div>
        <div>
          <strong className="block text-sm text-[var(--muted)]">
            Evaluation coverage
          </strong>
          <span className="text-3xl font-bold">{report.evaluated_weight}%</span>
        </div>
        <div>
          <strong className="block text-sm text-[var(--muted)]">
            Export blockers
          </strong>
          <span className="text-3xl font-bold">{report.blocker_count}</span>
        </div>
      </section>
      {report.overall_score_basis_points === null ? (
        <p className="notice mt-4" role="status">
          Fewer than 80% of weighted categories were evaluable, so no overall
          number is shown. Category findings remain available.
        </p>
      ) : null}
      {report.blocker_count ? (
        <p
          className="mt-4 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          Final export is blocked because one or more factual claims lack
          current approved evidence. A high numeric estimate cannot override
          this control.
        </p>
      ) : null}

      <section className="mt-10" aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="text-2xl font-semibold">
          Category calculations
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Scores use earned applicable points divided by applicable points.
          Unavailable categories do not receive automatic credit.
        </p>
        <dl className="mt-4 grid gap-3 md:hidden">
          {view.categories.map((category) => (
            <div
              key={category.category}
              className="rounded-lg border border-[var(--border)] p-4"
            >
              <dt className="font-semibold">{category.label}</dt>
              <dd className="mt-2 grid gap-1 text-sm">
                <span>
                  Result:{" "}
                  {category.score_basis_points === null
                    ? "Not evaluated"
                    : percent(category.score_basis_points)}
                </span>
                <span>
                  Earned / applicable: {category.earned_points} /{" "}
                  {category.applicable_points}
                </span>
                <span>Weight: {category.weight}%</span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Deterministic ATS category scores and weights
            </caption>
            <thead>
              <tr>
                <th className="border-b border-[var(--border)] p-3">
                  Category
                </th>
                <th className="border-b border-[var(--border)] p-3">Result</th>
                <th className="border-b border-[var(--border)] p-3">
                  Earned / applicable
                </th>
                <th className="border-b border-[var(--border)] p-3">Weight</th>
              </tr>
            </thead>
            <tbody>
              {view.categories.map((category) => (
                <tr key={category.category}>
                  <th className="border-b border-[var(--border)] p-3 font-medium">
                    {category.label}
                  </th>
                  <td className="border-b border-[var(--border)] p-3">
                    {category.score_basis_points === null
                      ? "Not evaluated"
                      : percent(category.score_basis_points)}
                  </td>
                  <td className="border-b border-[var(--border)] p-3">
                    {category.earned_points} / {category.applicable_points}
                  </td>
                  <td className="border-b border-[var(--border)] p-3">
                    {category.weight}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="findings-heading">
        <h2 id="findings-heading" className="text-2xl font-semibold">
          Explainable findings
        </h2>
        {view.findings.length ? (
          <ol className="mt-4 grid gap-4">
            {view.findings.map((finding) => (
              <li
                key={finding.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">
                    {finding.rule_id} · {finding.category}
                  </h3>
                  <span className="status-label">
                    {finding.blocker ? "blocker" : finding.severity}
                  </span>
                </div>
                <p className="mt-3">{finding.message}</p>
                <p className="mt-2">
                  <strong>Recommended action:</strong> {finding.remediation}
                </p>
                <details className="mt-3">
                  <summary className="cursor-pointer font-medium">
                    Rule evidence and threshold
                  </summary>
                  <dl className="mt-2 grid gap-2 text-sm">
                    <div>
                      <dt className="font-semibold">Affected location</dt>
                      <dd className="whitespace-pre-wrap break-all">
                        {json(finding.location)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Measured</dt>
                      <dd className="whitespace-pre-wrap break-all">
                        {json(finding.measured)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Threshold</dt>
                      <dd className="whitespace-pre-wrap break-all">
                        {json(finding.threshold)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Rule point loss</dt>
                      <dd>{percent(finding.point_loss_basis_points)}</dd>
                    </div>
                  </dl>
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <p className="notice mt-4">No rule findings were emitted.</p>
        )}
      </section>

      <section
        className="mt-10 rounded-xl border border-[var(--border)] p-5"
        aria-labelledby="method-heading"
      >
        <h2 id="method-heading" className="text-2xl font-semibold">
          Method and limitations
        </h2>
        <p className="mt-3">
          This is an explainable estimate over canonical content, reviewed
          requirements, and provenance. It does not emulate a named ATS,
          guarantee parsing, predict ranking, or predict hiring outcomes. AI
          availability and AI-generated explanation text cannot change these
          scores or findings.
        </p>
        <dl className="mt-4 grid gap-2 text-sm">
          <div>
            <dt className="font-semibold">Ruleset</dt>
            <dd>{report.ruleset_version}</dd>
          </div>
          <div>
            <dt className="font-semibold">Created</dt>
            <dd>{report.created_at.toISOString()}</dd>
          </div>
          <div>
            <dt className="font-semibold">Document version and hash</dt>
            <dd className="break-all">
              {report.document_version_id} · {report.document_hash}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Job snapshot hash</dt>
            <dd className="break-all">{report.job_hash}</dd>
          </div>
          <div>
            <dt className="font-semibold">Complete input hash</dt>
            <dd className="break-all">{report.input_hash}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Full methodology and fixture-backed thresholds are documented in the
          repository under docs/ats.
        </p>
      </section>
    </main>
  );
}
