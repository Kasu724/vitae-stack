"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CanonicalDocument } from "../document-schema";
import {
  draftConflictResponseSchema,
  type DraftConflictResponse,
} from "../draft-contract";
import { commitDocumentVersionAction } from "../actions";

interface ComparableBlock {
  id: string;
  label: string;
  text: string;
}

function comparableBlocks(document: CanonicalDocument): ComparableBlock[] {
  return document.sections.flatMap((section) =>
    section.blocks.map((block, index) => ({
      id: block.id,
      label: `${section.heading || section.type} / block ${index + 1}`,
      text: block.text,
    })),
  );
}

export function DocumentEditor({
  documentId,
  baseVersionId,
  initialContent,
  initialDraftRevision,
  idempotencyKey,
}: {
  documentId: string;
  baseVersionId: string;
  initialContent: CanonicalDocument;
  initialDraftRevision: number;
  idempotencyKey: string;
}) {
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState("All changes saved as a draft.");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autosaveBlocked, setAutosaveBlocked] = useState(false);
  const [activeBaseVersionId, setActiveBaseVersionId] = useState(baseVersionId);
  const [conflict, setConflict] = useState<
    DraftConflictResponse["server"] | null
  >(null);
  const changed = useRef(false);
  const latestContent = useRef(content);
  const revision = useRef(initialDraftRevision);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    if (!changed.current || autosaveBlocked) return;
    const timeout = window.setTimeout(() => {
      const snapshot = structuredClone(content);
      const snapshotText = JSON.stringify(snapshot);
      queue.current = queue.current
        .catch(() => undefined)
        .then(async () => {
          setStatus("Saving draft…");
          let response: Response;
          try {
            response = await fetch(`/api/documents/${documentId}/draft`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                baseVersionId: activeBaseVersionId,
                expectedRevision: revision.current,
                content: snapshot,
              }),
            });
          } catch {
            setStatus(
              "Draft could not be saved. Your text remains in this browser tab. Edit again to retry.",
            );
            return;
          }
          if (response.status === 409) {
            const conflictResponse = draftConflictResponseSchema.safeParse(
              await response.json().catch(() => null),
            );
            setAutosaveBlocked(true);
            if (conflictResponse.success) {
              setConflict(conflictResponse.data.server);
              setStatus(
                "Draft conflict. Saving is paused. Compare the local and server text below, then explicitly choose which draft to keep.",
              );
            } else {
              setStatus(
                "Draft conflict. Saving is paused to avoid overwriting another tab. Copy any text you need, then reload to compare.",
              );
            }
            return;
          }
          if (!response.ok) {
            setStatus(
              "Draft could not be saved. Your text remains in this browser tab. Edit again to retry.",
            );
            return;
          }
          const result = (await response.json()) as { revision: number };
          revision.current = result.revision;
          if (JSON.stringify(latestContent.current) === snapshotText) {
            changed.current = false;
            setHasUnsavedChanges(false);
            setStatus("Draft saved.");
          }
        })
        .catch(() => {
          setStatus(
            "Draft could not be saved. Your text remains in this browser tab. Edit again to retry.",
          );
        });
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [activeBaseVersionId, autosaveBlocked, content, documentId]);

  useEffect(() => {
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  const wordCount = useMemo(
    () =>
      content.sections
        .flatMap((section) => section.blocks)
        .reduce(
          (count, block) =>
            count + (block.text.trim().match(/\S+/gu)?.length ?? 0),
          0,
        ),
    [content],
  );
  const conflictChanges = useMemo(() => {
    if (!conflict) return [];
    const local = new Map(
      comparableBlocks(content).map((block) => [block.id, block]),
    );
    const server = new Map(
      comparableBlocks(conflict.content).map((block) => [block.id, block]),
    );
    return [...new Set([...local.keys(), ...server.keys()])]
      .map((id) => ({ id, local: local.get(id), server: server.get(id) }))
      .filter((change) => change.local?.text !== change.server?.text);
  }, [conflict, content]);

  function useServerDraft() {
    if (!conflict) return;
    const serverContent = structuredClone(conflict.content);
    setContent(serverContent);
    latestContent.current = serverContent;
    revision.current = conflict.revision;
    setActiveBaseVersionId(conflict.baseVersionId);
    changed.current = false;
    setHasUnsavedChanges(false);
    setAutosaveBlocked(false);
    setConflict(null);
    setStatus("Server draft loaded. No local changes are pending.");
  }

  function reapplyLocalDraft() {
    if (!conflict) return;
    revision.current = conflict.revision;
    setActiveBaseVersionId(conflict.baseVersionId);
    changed.current = true;
    setHasUnsavedChanges(true);
    setAutosaveBlocked(false);
    setConflict(null);
    setStatus(
      "Reapplying the local draft against the reviewed server revision…",
    );
  }

  function updateBlock(sectionIndex: number, blockIndex: number, text: string) {
    changed.current = true;
    setHasUnsavedChanges(true);
    setStatus("Draft changes pending.");
    setContent((current) => {
      const next = structuredClone(current);
      next.sections[sectionIndex]!.blocks[blockIndex]!.text = text;
      latestContent.current = next;
      return next;
    });
  }

  return (
    <div>
      <p
        className="notice"
        role={autosaveBlocked ? "alert" : "status"}
        aria-live="polite"
      >
        {status}
      </p>
      {autosaveBlocked ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            className="secondary-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload server draft
          </button>
        </div>
      ) : null}
      {conflict ? (
        <section
          className="mt-5 rounded-xl border border-[var(--border)] p-4"
          aria-labelledby="draft-conflict-heading"
        >
          <h2 id="draft-conflict-heading" className="text-lg font-semibold">
            Draft conflict comparison
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Server {conflict.source === "draft" ? "draft" : "version"} from{" "}
            {new Date(conflict.updatedAt).toLocaleString()}. Choosing the local
            draft overwrites that mutable server draft; immutable versions
            remain in history.
          </p>
          {conflictChanges.length ? (
            <ul className="mt-4 grid gap-4">
              {conflictChanges.map((change) => (
                <li
                  key={change.id}
                  className="min-w-0 rounded-lg border border-[var(--border)] p-3"
                >
                  <h3 className="font-semibold">
                    {change.local?.label ?? change.server?.label ?? change.id}
                  </h3>
                  <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold">This tab</h4>
                      <pre className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {change.local?.text ?? "Block removed"}
                      </pre>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold">Server</h4>
                      <pre className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {change.server?.text ?? "Block removed"}
                      </pre>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3">The visible block text is identical.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="secondary-button"
              type="button"
              onClick={useServerDraft}
            >
              Use server draft
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={reapplyLocalDraft}
            >
              Overwrite server draft with this tab
            </button>
          </div>
        </section>
      ) : null}
      <p className="mt-3 text-sm text-[var(--muted)]">
        {wordCount.toLocaleString()} words. Browser undo and redo remain
        available while focus is in a text field.
      </p>
      <div className="mt-5 grid gap-5">
        {content.sections.map((section, sectionIndex) => (
          <section
            key={section.id}
            className="rounded-xl border border-[var(--border)] p-4"
            aria-labelledby={`section-${section.id}`}
          >
            <h2 id={`section-${section.id}`} className="text-lg font-semibold">
              {section.heading || section.type}
            </h2>
            <div className="mt-3 grid gap-3">
              {section.blocks.map((block, blockIndex) => (
                <label className="grid gap-1" key={block.id}>
                  <span className="text-sm font-medium">
                    {block.type === "bullet"
                      ? `Bullet ${blockIndex + 1}`
                      : "Text"}
                  </span>
                  <textarea
                    className="field"
                    rows={block.type === "paragraph" ? 5 : 3}
                    value={block.text}
                    onChange={(event) =>
                      updateBlock(sectionIndex, blockIndex, event.target.value)
                    }
                  />
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
      <form
        action={commitDocumentVersionAction}
        className="mt-5"
        onSubmit={() => setHasUnsavedChanges(false)}
      >
        <input type="hidden" name="documentId" value={documentId} />
        <input type="hidden" name="baseVersionId" value={activeBaseVersionId} />
        <input type="hidden" name="content" value={JSON.stringify(content)} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <button className="button" type="submit" disabled={autosaveBlocked}>
          Save immutable version
        </button>
      </form>
    </div>
  );
}
