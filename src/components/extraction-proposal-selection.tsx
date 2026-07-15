"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";

type ProposalAction = (form: FormData) => Promise<void> | void;
type Decision = "approve" | "reject";

interface ProposalSelectionItem {
  id: string;
  label: string;
}

interface ProposalSelectionContextValue {
  selected: Set<string>;
  toggle: (proposalId: string, checked: boolean) => void;
}

const ProposalSelectionContext =
  createContext<ProposalSelectionContextValue | null>(null);

function SubmitButton({
  decision,
  count,
}: {
  decision: Decision;
  count: number;
}) {
  const { pending } = useFormStatus();
  const verb = decision === "approve" ? "Approve" : "Reject";
  return (
    <button
      className={decision === "reject" ? "danger-button" : "button"}
      type="submit"
      disabled={pending}
    >
      {pending ? "Working…" : `${verb} ${count}`}
    </button>
  );
}

function ConfirmationDialog({
  decision,
  items,
  batchId,
  page,
  action,
  onClose,
}: {
  decision: Decision;
  items: ProposalSelectionItem[];
  batchId: string;
  page: number;
  action: ProposalAction;
  onClose: () => void;
}) {
  const headingId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const count = items.length;
  const noun = count === 1 ? "proposal" : "proposals";
  const verb = decision === "approve" ? "Approve" : "Reject";

  useEffect(() => cancelRef.current?.focus(), []);

  return (
    <div
      className="motion-backdrop fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <section
        aria-labelledby={headingId}
        aria-modal="true"
        className="motion-dialog max-h-[min(42rem,90vh)] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-raised)]"
        role="dialog"
      >
        <h2 id={headingId} className="text-2xl font-semibold">
          {verb} {count} {noun}?
        </h2>
        <p className="mt-3">
          Are you sure you want to {decision} the following {noun}?
        </p>
        <ul className="mt-4 grid gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-4">
          {items.map((item) => (
            <li key={item.id} className="whitespace-pre-wrap break-words">
              {item.label}
            </li>
          ))}
        </ul>
        <form action={action} className="mt-6 flex flex-wrap justify-end gap-3">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="page" value={page} />
          {items.map((item) => (
            <input
              key={item.id}
              type="hidden"
              name="proposalId"
              value={item.id}
            />
          ))}
          <button
            className="secondary-button"
            type="button"
            ref={cancelRef}
            onClick={onClose}
          >
            Cancel
          </button>
          <SubmitButton decision={decision} count={count} />
        </form>
      </section>
    </div>
  );
}

export function ExtractionProposalSelection({
  items,
  batchId,
  page,
  approveAction,
  rejectAction,
  children,
}: {
  items: ProposalSelectionItem[];
  batchId: string;
  page: number;
  approveAction: ProposalAction;
  rejectAction: ProposalAction;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmation, setConfirmation] = useState<{
    decision: Decision;
    ids: string[];
  } | null>(null);
  const selectedItems = items.filter((item) => selected.has(item.id));

  const toggle = (proposalId: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        if (next.size >= 20) return current;
        next.add(proposalId);
      } else {
        next.delete(proposalId);
      }
      return next;
    });
  };

  const openConfirmation = (decision: Decision) =>
    setConfirmation({
      decision,
      ids: selectedItems.map((item) => item.id),
    });

  return (
    <ProposalSelectionContext.Provider value={{ selected, toggle }}>
      {items.length ? (
        <section
          className="selection-toolbar sticky top-2 z-40 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-raised)]"
          aria-labelledby="proposal-actions-heading"
        >
          <div>
            <h2 id="proposal-actions-heading" className="font-semibold">
              Proposal decisions
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Select up to 20 pending proposals on this page, then approve or
              reject them together.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-[var(--muted)]" role="status">
              {selected.size} selected
            </span>
            <button
              className="button"
              type="button"
              disabled={!selected.size}
              onClick={() => openConfirmation("approve")}
            >
              Approve selected
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!selected.size}
              onClick={() => openConfirmation("reject")}
            >
              Reject selected
            </button>
          </div>
        </section>
      ) : null}
      {children}
      {confirmation ? (
        <ConfirmationDialog
          decision={confirmation.decision}
          items={items.filter((item) => confirmation.ids.includes(item.id))}
          batchId={batchId}
          page={page}
          action={
            confirmation.decision === "approve" ? approveAction : rejectAction
          }
          onClose={() => setConfirmation(null)}
        />
      ) : null}
    </ProposalSelectionContext.Provider>
  );
}

export function ExtractionProposalCheckbox({
  proposalId,
  label,
}: {
  proposalId: string;
  label: string;
}) {
  const context = useContext(ProposalSelectionContext);
  if (!context)
    throw new Error(
      "ExtractionProposalCheckbox must be inside ExtractionProposalSelection.",
    );
  const checked = context.selected.has(proposalId);
  const limitReached = !checked && context.selected.size >= 20;

  return (
    <label className="flex min-h-10 items-center gap-3 font-medium">
      <input
        type="checkbox"
        className="size-5 shrink-0 accent-[var(--action)]"
        checked={checked}
        disabled={limitReached}
        onChange={(event) => context.toggle(proposalId, event.target.checked)}
      />
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">Select</span>
    </label>
  );
}
