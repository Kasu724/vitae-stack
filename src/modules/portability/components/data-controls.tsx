"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

interface Preview {
  tableCounts: Record<string, number>;
  existingRecordCount: number;
  identifierConflictCount: number;
  secretFieldCount: number;
  sourceBlobCount: number;
  artifactBlobCount: number;
  canApply: boolean;
  reasons: string[];
}

export function DataControls() {
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [archive, setArchive] = useState<File | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (preview) previewHeading.current?.focus();
  }, [preview]);

  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Preparing a private portability archive.");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/portability/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        includeSources: form.get("includeSources") === "on",
        includeArtifacts: form.get("includeArtifacts") === "on",
      }),
    });
    if (!response.ok) {
      setStatus(
        "The archive could not be created. Return to the local workspace and retry.",
      );
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vitae-stack-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Archive created and offered for download.");
  }

  async function importArchive(mode: "dry-run" | "apply") {
    if (!archive) {
      setStatus("Choose an archive first.");
      return;
    }
    setStatus(mode === "dry-run" ? "Checking archive." : "Importing archive.");
    const form = new FormData();
    form.set("file", archive);
    form.set("purpose", mode);
    const response = await fetch("/api/portability/import", {
      method: "POST",
      body: form,
    });
    const body = (await response.json()) as {
      preview?: Preview;
      code?: string;
    };
    if (!response.ok || !body.preview) {
      setStatus(`Archive operation failed (${body.code ?? "UNKNOWN"}).`);
      return;
    }
    setPreview(body.preview);
    setStatus(
      mode === "apply"
        ? "Archive imported. Reload the workspace to view its records."
        : body.preview.canApply
          ? "Dry run passed. This archive can be imported into this empty workspace."
          : "Dry run found conflicts. No data was changed.",
    );
  }

  async function deleteWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus("Freezing the workspace and deleting active data.");
    const response = await fetch("/api/privacy/workspace-deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: form.get("confirmation") }),
    });
    const body = (await response.json()) as {
      state?: string;
      operationId?: string;
      backupExpiresAt?: string;
      errorCode?: string;
    };
    if (!response.ok || body.state !== "succeeded") {
      setStatus(
        `Deletion was queued for retry (${body.errorCode ?? "REQUEST_FAILED"}). The workspace remains frozen.`,
      );
      return;
    }
    setStatus(
      `Deletion ${body.operationId} completed. Operator backups expire no later than ${body.backupExpiresAt}.`,
    );
  }

  return (
    <div className="grid gap-8">
      <p className="rounded-lg border border-[var(--border)] p-4" role="status">
        {status || "No data operation is running."}
      </p>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-xl font-semibold">Export all portable data</h2>
        <p className="mt-2 text-[var(--muted)]">
          The JSON archive includes records, document history, provenance, and
          settings. Credentials and secret values are never included.
        </p>
        <form onSubmit={download} className="mt-4 grid gap-3">
          <label className="flex items-start gap-2">
            <input type="checkbox" name="includeSources" />
            Include available uploaded source bytes
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="includeArtifacts" />
            Include unexpired generated export artifacts
          </label>
          <button className="button w-fit" type="submit">
            Create archive
          </button>
        </form>
      </section>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-xl font-semibold">Import project archive</h2>
        <p className="mt-2 text-[var(--muted)]">
          Dry run validates integrity, counts conflicts, and makes no writes.
          Import is allowed only into an empty workspace.
        </p>
        <label className="mt-4 grid gap-1 font-medium">
          Vitae Stack JSON archive
          <input
            className="field"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              setArchive(event.target.files?.[0] ?? null);
              setPreview(null);
            }}
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="secondary-button"
            type="button"
            onClick={() => importArchive("dry-run")}
          >
            Run dry check
          </button>
          <button
            className="button"
            type="button"
            disabled={!preview?.canApply}
            onClick={() => importArchive("apply")}
          >
            Import checked archive
          </button>
        </div>
        {preview ? (
          <div className="mt-5">
            <h3 ref={previewHeading} className="font-semibold" tabIndex={-1}>
              Dry-run result
            </h3>
            <ul className="mt-2 list-disc pl-6">
              <li>
                {Object.values(preview.tableCounts).reduce(
                  (sum, count) => sum + count,
                  0,
                )}{" "}
                records
              </li>
              <li>{preview.sourceBlobCount} source files</li>
              <li>{preview.artifactBlobCount} export artifacts</li>
              <li>{preview.existingRecordCount} existing target records</li>
              <li>{preview.identifierConflictCount} identifier conflicts</li>
              <li>{preview.secretFieldCount} secret-bearing fields</li>
              {preview.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <section className="rounded-xl border border-[var(--danger)] p-5">
        <h2 className="text-xl font-semibold">Permanently delete workspace</h2>
        <p className="mt-2">
          This freezes writes, deletes active database records and private
          files, and removes the account. It cannot be undone. Encrypted
          operator backups expire within 30 days and may retain data until then.
        </p>
        <form onSubmit={deleteWorkspace} className="mt-4 grid max-w-xl gap-3">
          <label className="grid gap-1 font-medium">
            Type DELETE MY WORKSPACE
            <input
              className="field"
              name="confirmation"
              autoComplete="off"
              required
            />
          </label>
          <button className="danger-button w-fit" type="submit">
            Permanently delete workspace
          </button>
        </form>
      </section>
    </div>
  );
}
