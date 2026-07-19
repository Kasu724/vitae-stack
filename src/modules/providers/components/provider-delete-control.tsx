"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { deleteProviderAction } from "../actions";

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M5 7h14M9 7V4.5h6V7m-8 0 1 12h8l1-12M10 10.5v5M14 10.5v5" />
    </svg>
  );
}

function DeleteSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="danger-button" type="submit" disabled={pending}>
      {pending ? "Deleting…" : "Delete provider"}
    </button>
  );
}

export function ProviderDeleteControl({
  configurationId,
  expectedRevision,
  label,
  savedHistoryCount,
}: {
  configurationId: string;
  expectedRevision: number;
  label: string;
  savedHistoryCount: number;
}) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inUse = savedHistoryCount > 0;

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        className="danger-button min-h-10 gap-2 px-3 py-2"
        type="button"
        disabled={inUse}
        title={
          inUse
            ? "This provider is retained because saved AI history references it."
            : `Delete ${label}`
        }
        onClick={() => setOpen(true)}
      >
        <TrashIcon />
        Delete
      </button>
      {open ? (
        <div
          className="motion-backdrop fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
          role="presentation"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          <section
            aria-labelledby={headingId}
            aria-modal="true"
            className="motion-dialog w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-raised)]"
            role="dialog"
          >
            <h2 id={headingId} className="text-2xl font-semibold">
              Delete provider?
            </h2>
            <p className="mt-3">
              <strong>{label}</strong> and its stored credential will be
              permanently deleted. This cannot be undone.
            </p>
            <p className="mt-4 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm">
              Task model assignments for this provider will also be removed.
              Manual features and other providers are not affected.
            </p>
            <form
              action={deleteProviderAction}
              className="mt-6 flex flex-wrap justify-end gap-3"
            >
              <input
                type="hidden"
                name="configurationId"
                value={configurationId}
              />
              <input
                type="hidden"
                name="expectedRevision"
                value={expectedRevision}
              />
              <button
                ref={cancelRef}
                className="secondary-button"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <DeleteSubmitButton />
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
