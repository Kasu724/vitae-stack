"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

interface Result {
  artifactId: string;
  classification: "final" | "draft";
  filename: string;
  downloadUrl: string;
  expiresAt: string;
}

export function ExportGenerator({
  documentId,
  versions,
}: {
  documentId: string;
  versions: Array<{ id: string; label: string; current: boolean }>;
}) {
  const router = useRouter();
  const alertRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          versionId: data.get("versionId"),
          format: data.get("format"),
        }),
      });
      const body = (await response.json()) as Partial<Result> & {
        code?: string;
        message?: string;
      };
      if (!response.ok) {
        setError({
          code: body.code ?? "EXPORT_FAILED",
          message:
            body.message ??
            "The export could not be created. Review the document and try again.",
        });
        requestAnimationFrame(() => alertRef.current?.focus());
        return;
      }
      setResult(body as Result);
      router.refresh();
    } catch {
      setError({
        code: "EXPORT_FAILED",
        message: "The export service is unavailable. Try again.",
      });
      requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {error ? (
        <div
          ref={alertRef}
          className="mb-5 rounded-lg border border-[var(--danger)] p-4"
          role="alert"
          tabIndex={-1}
        >
          <p>{error.message}</p>
          {error.code === "UNSUPPORTED_CLAIMS" ? (
            <p className="mt-2">
              <Link href={`/documents/${documentId}#claim-support-heading`}>
                Review and remediate claim support
              </Link>
              . Draft Markdown, text, and JSON remain available with a visible
              warning.
            </p>
          ) : null}
        </div>
      ) : null}
      {result ? (
        <div className="notice mb-5" role="status">
          <p>
            {result.classification === "draft" ? "Draft" : "Final"} artifact
            created. It expires at {new Date(result.expiresAt).toISOString()}.
          </p>
          <a className="mt-2 inline-block" href={result.downloadUrl}>
            Download {result.filename}
          </a>
        </div>
      ) : null}
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1 font-medium">
          Immutable document version
          <select className="field" name="versionId" required>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.label}
                {version.current ? " — current" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 font-medium">
          Export format
          <select className="field" name="format" defaultValue="pdf" required>
            <option value="pdf">PDF (final only)</option>
            <option value="docx">DOCX (final only)</option>
            <option value="markdown">Markdown</option>
            <option value="text">Plain text</option>
            <option value="json">Structured document JSON</option>
          </select>
        </label>
        <button className="button w-fit" type="submit" disabled={pending}>
          {pending ? "Validating and rendering…" : "Create private export"}
        </button>
      </form>
    </div>
  );
}
