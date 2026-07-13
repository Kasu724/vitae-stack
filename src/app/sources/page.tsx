import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ResourceCardList } from "@/components/resource-card-list";
import { getRuntimePool } from "@/infrastructure/database/runtime";
import { getCurrentPrincipal } from "@/modules/auth/principal";
import { deleteSourcesAction } from "@/modules/ingestion/actions";
import { SourceRepository } from "@/modules/ingestion/source-repository";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  FILE_REQUIRED: "Choose a file to import.",
  EMPTY_FILE: "The selected file is empty.",
  FILE_TOO_LARGE: "The file exceeds the configured upload limit.",
  INVALID_FILENAME: "The filename is not accepted.",
  UNSUPPORTED_EXTENSION: "Use PDF, DOCX, Markdown, text, or JSON.",
  SIGNATURE_MISMATCH: "The file content does not match an allowed format.",
  EXTENSION_MISMATCH: "The filename extension does not match the file content.",
  DECLARED_TYPE_MISMATCH:
    "The browser media type does not match the file content.",
  INVALID_DOCX_ARCHIVE: "The DOCX archive is invalid.",
  INVALID_DOCX_STRUCTURE: "The DOCX is missing required document parts.",
  UNSAFE_DOCX_ENTRY: "The DOCX contains an unsafe archive entry.",
  DOCX_RESOURCE_LIMIT: "The DOCX archive exceeds safe expansion limits.",
  ACTIVE_DOCX_CONTENT: "DOCX macros or embedded objects are not accepted.",
  EXTERNAL_DOCX_RELATIONSHIP:
    "DOCX relationships to external files or URLs are not accepted.",
  UNSAFE_DOCX_XML: "The DOCX contains unsafe XML declarations.",
  TEXT_BINARY_CONTENT: "The text file contains invalid UTF-8 or binary data.",
  INVALID_MULTIPART: "The upload request is malformed.",
  TOO_MANY_FILES: "Upload one file at a time.",
  UPLOAD_RATE_LIMIT:
    "The hourly workspace upload limit was reached. Try again later.",
  UPLOAD_FAILED:
    "The import could not be completed. No document content was logged.",
};

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getCurrentPrincipal(await headers());
  if (!principal) redirect("/");
  const query = await searchParams;
  const sources = await new SourceRepository(getRuntimePool()).list(principal);
  const errorCode = typeof query.error === "string" ? query.error : null;
  return (
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Link href="/dashboard">Dashboard</Link>{" "}
        <span aria-hidden="true">/</span> Source documents
      </nav>
      <h1 className="mt-5 text-3xl font-bold">Source documents</h1>
      <p className="mt-2 text-[var(--muted)]">
        Files are private, validated by content, and parsed as untrusted input.
        Extracted text is never verified career evidence until you approve
        proposals.
      </p>
      {errorCode ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          {errors[errorCode] ?? errors.UPLOAD_FAILED}
        </p>
      ) : null}
      {query.notice === "deleted" ? (
        <p className="notice mt-6" role="status">
          The source bytes and active source record were deleted.
        </p>
      ) : null}
      {query.notice === "delete-blocked" ? (
        <p
          className="mt-6 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
        >
          Resolve pending extraction proposals for every selected source, then
          try deleting them again.
        </p>
      ) : null}
      <section
        className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="import-heading"
      >
        <h2 id="import-heading" className="text-xl font-semibold">
          Import a document
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Allowed: PDF, DOCX, Markdown, plain text, and project JSON; maximum 10
          MiB by default. Uploading does not approve extracted facts.
        </p>
        <form
          action="/api/sources"
          method="post"
          encType="multipart/form-data"
          className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto]"
        >
          <label className="grid gap-1 font-medium">
            Purpose
            <select className="field" name="purpose">
              <option value="resume">Resume</option>
              <option value="cover_letter">Cover letter</option>
              <option value="career_evidence">Career evidence</option>
              <option value="project_import">Project JSON</option>
            </select>
          </label>
          <label className="grid gap-1 font-medium">
            Document
            <input
              className="field"
              type="file"
              name="file"
              required
              accept=".pdf,.docx,.md,.markdown,.txt,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain,application/json"
            />
          </label>
          <button className="button self-end" type="submit">
            Upload and parse
          </button>
        </form>
      </section>
      <section className="mt-8" aria-labelledby="source-list-heading">
        <h2 id="source-list-heading" className="text-2xl font-semibold">
          Imported sources
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]" role="status">
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </p>
        {sources.length ? (
          <ResourceCardList
            items={sources.map((source) => ({
              id: source.id,
              title: source.original_name,
              href: `/sources/${source.id}`,
              status: source.status,
              category: source.purpose.replaceAll("_", " "),
              metadata: [
                `${source.detected_media_type} · ${source.byte_size.toLocaleString()} bytes`,
              ],
              deleteImpact: [
                "The private source bytes and extracted preview will be removed.",
                "Approved facts remain available with a source-unavailable marker.",
              ],
            }))}
            resourceName="source"
            resourceNamePlural="sources"
            headingLevel={3}
            status="active"
            deleteAction={deleteSourcesAction}
            deleteWarning="Deletion cannot be undone. A source with pending extraction proposals is blocked until that review is resolved."
            returnPath="/sources"
          />
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-8">
            No source documents have been imported.
          </p>
        )}
      </section>
    </main>
  );
}
