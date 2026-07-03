import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FilesystemArtifactStore } from "@/infrastructure/artifacts/filesystem-store";
import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { DocumentRepository } from "@/modules/documents/repository";
import { ExportGenerator } from "@/modules/exports/components/export-generator";
import { ExportNotFoundError, ExportService } from "@/modules/exports/service";

export const dynamic = "force-dynamic";

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const query = await searchParams;
  const documentId =
    typeof query.documentId === "string" ? query.documentId : null;
  const pool = getRuntimePool();
  if (!documentId) {
    const documents = await new DocumentRepository(pool).list(principal);
    return (
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <nav aria-label="Breadcrumb">
          <Link href="/dashboard">Dashboard</Link>{" "}
          <span aria-hidden="true">/</span> Export
        </nav>
        <h1 className="mt-5 text-3xl font-bold">Choose a document to export</h1>
        {documents.length ? (
          <ul className="mt-6 grid gap-3">
            {documents.map((document) => (
              <li
                key={document.id}
                className="rounded-lg border border-[var(--border)] p-4"
              >
                <Link href={`/exports?documentId=${document.id}`}>
                  {document.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6">
            No active document exists.{" "}
            <Link href="/documents">Create one.</Link>
          </p>
        )}
      </main>
    );
  }

  const environment = readServerEnvironment();
  const service = new ExportService(
    pool,
    new FilesystemArtifactStore(environment.ARTIFACT_STORAGE_ROOT),
  );
  let setup;
  try {
    setup = await service.getSetup(principal, documentId);
  } catch (error) {
    if (error instanceof ExportNotFoundError) redirect("/exports");
    throw error;
  }

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href={`/documents/${documentId}`}>{setup.document.title}</Link>{" "}
        <span aria-hidden="true">/</span> Export
      </nav>
      <h1 className="mt-5 text-3xl font-bold">Export document</h1>
      <p className="mt-2 max-w-3xl text-[var(--muted)]">
        Exports use the fixed ATS-safe single-column template and are validated
        by parsing generated content back before private storage. PDF and DOCX
        are blocked if any tracked factual claim lacks current approved
        evidence. Artifacts expire after 24 hours.
      </p>
      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="create-export-heading"
      >
        <h2 id="create-export-heading" className="text-xl font-semibold">
          Create export
        </h2>
        <div className="mt-4">
          <ExportGenerator
            documentId={documentId}
            versions={setup.versions.map((version) => ({
              id: version.id,
              current: version.current,
              label: `${version.created_at.toISOString()} · ${version.reason.replaceAll("_", " ")}`,
            }))}
          />
        </div>
      </section>
      <section className="mt-10" aria-labelledby="artifacts-heading">
        <h2 id="artifacts-heading" className="text-2xl font-semibold">
          Available private artifacts
        </h2>
        {setup.artifacts.length ? (
          <ul className="mt-4 grid gap-3">
            {setup.artifacts.map((artifact) => (
              <li
                key={artifact.id}
                className="rounded-lg border border-[var(--border)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <strong>{artifact.filename}</strong>{" "}
                    <span className="status-label">
                      {artifact.classification}
                    </span>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {artifact.byte_size} bytes · expires{" "}
                      {artifact.expires_at.toISOString()}
                    </p>
                  </div>
                  <a
                    className="secondary-button"
                    href={`/api/exports/${artifact.id}`}
                  >
                    Download
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[var(--muted)]">
            No unexpired export artifact exists for this document.
          </p>
        )}
      </section>
    </main>
  );
}
