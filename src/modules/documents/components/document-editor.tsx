"use client";

import { useEffect, useRef, useState } from "react";

import type { CanonicalDocument } from "../document-schema";
import { commitDocumentVersionAction } from "../actions";

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
  const changed = useRef(false);
  const revision = useRef(initialDraftRevision);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    if (!changed.current) return;
    setStatus("Draft changes pending.");
    const timeout = window.setTimeout(() => {
      const snapshot = structuredClone(content);
      queue.current = queue.current.then(async () => {
        setStatus("Saving draft…");
        const response = await fetch(`/api/documents/${documentId}/draft`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            baseVersionId,
            expectedRevision: revision.current,
            content: snapshot,
          }),
        });
        if (response.status === 409) {
          setStatus("Draft conflict. Reload and compare before continuing.");
          return;
        }
        if (!response.ok) {
          setStatus(
            "Draft could not be saved. Your text remains in this browser tab.",
          );
          return;
        }
        const result = (await response.json()) as { revision: number };
        revision.current = result.revision;
        setStatus("Draft saved.");
      });
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [baseVersionId, content, documentId]);

  function updateBlock(sectionIndex: number, blockIndex: number, text: string) {
    changed.current = true;
    setContent((current) => {
      const next = structuredClone(current);
      next.sections[sectionIndex]!.blocks[blockIndex]!.text = text;
      return next;
    });
  }

  return (
    <div>
      <p className="notice" role="status" aria-live="polite">
        {status}
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
      <form action={commitDocumentVersionAction} className="mt-5">
        <input type="hidden" name="documentId" value={documentId} />
        <input type="hidden" name="baseVersionId" value={baseVersionId} />
        <input type="hidden" name="content" value={JSON.stringify(content)} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <button className="button" type="submit">
          Save immutable version
        </button>
      </form>
    </div>
  );
}
