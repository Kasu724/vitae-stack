"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export interface ResourceCardItem {
  id: string;
  title: string;
  href: string;
  status: string;
  category?: string | undefined;
  subtitle?: string | undefined;
  metadata?: string[] | undefined;
  warning?: string | undefined;
  tags?: string[] | undefined;
  deleteImpact?: string[] | undefined;
}

type ResourceAction = (form: FormData) => Promise<void> | void;
type PendingAction = "archive" | "restore" | "delete";

interface ResourceCardListProps {
  items: ResourceCardItem[];
  resourceName: string;
  resourceNamePlural: string;
  headingLevel?: 2 | 3;
  status: "active" | "archived";
  archiveAction?: ResourceAction | undefined;
  deleteAction?: ResourceAction | undefined;
  deleteWarning?: string | undefined;
  returnPath: string;
}

function ArchiveIcon(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M4 7.5h16v12H4zM3 4.5h18v3H3zM9 11h6" />
    </svg>
  );
}

function RestoreIcon(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M4 7.5h16v12H4zM3 4.5h18v3H3zM8.5 13.5h7M11 11l-2.5 2.5L11 16" />
    </svg>
  );
}

function TrashIcon(): ReactNode {
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

function ActionIcon({ action }: { action: PendingAction }): ReactNode {
  if (action === "delete") return <TrashIcon />;
  if (action === "restore") return <RestoreIcon />;
  return <ArchiveIcon />;
}

function SubmitButton({ label, danger }: { label: string; danger: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={danger ? "danger-button" : "button"}
      type="submit"
      disabled={pending}
    >
      {pending ? "Working…" : label}
    </button>
  );
}

function ConfirmationDialog({
  action,
  items,
  resourceName,
  resourceNamePlural,
  archiveAction,
  deleteAction,
  deleteWarning,
  returnPath,
  onClose,
}: {
  action: PendingAction;
  items: ResourceCardItem[];
  resourceName: string;
  resourceNamePlural: string;
  archiveAction?: ResourceAction | undefined;
  deleteAction?: ResourceAction | undefined;
  deleteWarning?: string | undefined;
  returnPath: string;
  onClose: () => void;
}) {
  const headingId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const count = items.length;
  const noun = count === 1 ? resourceName : resourceNamePlural;
  const verb = action === "delete" ? "delete" : action;
  const verbLabel = verb[0]!.toUpperCase() + verb.slice(1);
  const formAction = action === "delete" ? deleteAction : archiveAction;

  useEffect(() => cancelRef.current?.focus(), []);

  if (!formAction) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <section
        aria-labelledby={headingId}
        aria-modal="true"
        className="max-h-[min(42rem,90vh)] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-raised)]"
        role="dialog"
      >
        <h2 id={headingId} className="text-2xl font-semibold">
          {verbLabel} {count} {noun}?
        </h2>
        <p className="mt-3">
          Are you sure you want to {verb} the following {noun}:
        </p>
        <ul className="mt-4 grid gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-4">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              {action === "delete" && item.deleteImpact?.length ? (
                <ul className="mt-1 list-disc pl-5 text-sm text-[var(--muted-strong)]">
                  {item.deleteImpact.map((impact) => (
                    <li key={impact}>{impact}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        {action === "delete" && deleteWarning ? (
          <p className="mt-4 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm">
            {deleteWarning}
          </p>
        ) : null}
        <form
          action={formAction}
          className="mt-6 flex flex-wrap justify-end gap-3"
        >
          {items.map((item) => (
            <input
              key={item.id}
              type="hidden"
              name="selectedId"
              value={item.id}
            />
          ))}
          <input
            type="hidden"
            name="archived"
            value={String(action === "archive")}
          />
          <input type="hidden" name="returnPath" value={returnPath} />
          <button
            className="secondary-button"
            type="button"
            ref={cancelRef}
            onClick={onClose}
          >
            Cancel
          </button>
          <SubmitButton
            danger={action === "delete"}
            label={`${verbLabel} ${count} ${noun}`}
          />
        </form>
      </section>
    </div>
  );
}

export function ResourceCardList({
  items,
  resourceName,
  resourceNamePlural,
  headingLevel = 2,
  status,
  archiveAction,
  deleteAction,
  deleteWarning,
  returnPath,
}: ResourceCardListProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pendingAction, setPendingAction] = useState<{
    action: PendingAction;
    ids: string[];
  } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectedItems = items.filter((item) => selected.has(item.id));
  const statusAction: PendingAction =
    status === "active" ? "archive" : "restore";
  const statusActionLabel = statusAction === "archive" ? "Archive" : "Restore";

  useEffect(() => {
    if (selectAllRef.current)
      selectAllRef.current.indeterminate =
        selected.size > 0 && selected.size < items.length;
  }, [items.length, selected.size]);

  const openConfirmation = (action: PendingAction, ids: string[]) =>
    setPendingAction({ action, ids });

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
        <label className="flex min-h-11 items-center gap-3 font-medium">
          <input
            ref={selectAllRef}
            type="checkbox"
            className="size-5 accent-[var(--action)]"
            checked={items.length > 0 && selected.size === items.length}
            onChange={(event) =>
              setSelected(
                event.target.checked
                  ? new Set(items.map((item) => item.id))
                  : new Set(),
              )
            }
          />
          Select all {resourceNamePlural}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-[var(--muted)]" role="status">
            {selected.size} selected
          </span>
          {archiveAction ? (
            <button
              className="secondary-button min-h-10 gap-2 px-3 py-2"
              type="button"
              disabled={!selected.size}
              onClick={() =>
                openConfirmation(
                  statusAction,
                  selectedItems.map((item) => item.id),
                )
              }
            >
              <ActionIcon action={statusAction} />
              {statusActionLabel} selected
            </button>
          ) : null}
          {deleteAction ? (
            <button
              className="danger-button min-h-10 gap-2 px-3 py-2"
              type="button"
              disabled={!selected.size}
              onClick={() =>
                openConfirmation(
                  "delete",
                  selectedItems.map((item) => item.id),
                )
              }
            >
              <TrashIcon />
              Delete selected
            </button>
          ) : null}
        </div>
      </div>
      <ul className="mt-4 grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const Heading = headingLevel === 3 ? "h3" : "h2";
          const checked = selected.has(item.id);
          return (
            <li
              key={item.id}
              className={`rounded-xl border bg-[var(--surface)] p-5 ${
                checked
                  ? "border-[var(--text-strong)] ring-2 ring-[var(--action-soft)]"
                  : "border-[var(--border)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <label className="flex min-h-10 min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-[var(--action)]"
                    checked={checked}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      setSelected(next);
                    }}
                  />
                  <span className="sr-only">Select {item.title}</span>
                  <span className="status-label">{item.status}</span>
                </label>
                <div className="flex shrink-0 items-center gap-1">
                  {archiveAction ? (
                    <button
                      className="grid size-10 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-subtle)]"
                      type="button"
                      title={`${statusActionLabel} ${item.title}`}
                      aria-label={`${statusActionLabel} ${item.title}`}
                      onClick={() => openConfirmation(statusAction, [item.id])}
                    >
                      <ActionIcon action={statusAction} />
                    </button>
                  ) : null}
                  {deleteAction ? (
                    <button
                      className="grid size-10 place-items-center rounded-md border border-[var(--danger)] bg-[var(--surface)] text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                      type="button"
                      title={`Delete ${item.title}`}
                      aria-label={`Delete ${item.title}`}
                      onClick={() => openConfirmation("delete", [item.id])}
                    >
                      <TrashIcon />
                    </button>
                  ) : null}
                </div>
              </div>
              {item.category ? (
                <p className="mt-2 text-sm capitalize text-[var(--muted)]">
                  {item.category}
                </p>
              ) : null}
              <Heading className="mt-2 text-xl font-semibold">
                <Link href={item.href}>{item.title}</Link>
              </Heading>
              {item.subtitle ? (
                <p className="mt-1 text-[var(--muted)]">{item.subtitle}</p>
              ) : null}
              {item.warning ? (
                <p className="mt-3 font-semibold">{item.warning}</p>
              ) : null}
              {item.metadata?.map((metadata) => (
                <p key={metadata} className="mt-2 text-sm text-[var(--muted)]">
                  {metadata}
                </p>
              ))}
              {item.tags?.length ? (
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Tags: {item.tags.join(", ")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {pendingAction ? (
        <ConfirmationDialog
          action={pendingAction.action}
          items={items.filter((item) => pendingAction.ids.includes(item.id))}
          resourceName={resourceName}
          resourceNamePlural={resourceNamePlural}
          archiveAction={archiveAction}
          deleteAction={deleteAction}
          deleteWarning={deleteWarning}
          returnPath={returnPath}
          onClose={() => setPendingAction(null)}
        />
      ) : null}
    </>
  );
}
