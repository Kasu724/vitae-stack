import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { DocumentEditor } from "@/modules/documents/components/document-editor";

vi.mock("@/modules/documents/actions", () => ({
  commitDocumentVersionAction: vi.fn(),
}));

describe("document editor behavior", () => {
  it("reports words and warns before losing a dirty draft", () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <DocumentEditor
          documentId="00000000-0000-4000-8000-000000000001"
          baseVersionId="00000000-0000-4000-8000-000000000002"
          initialDraftRevision={0}
          idempotencyKey="synthetic-editor-test"
          initialContent={{
            schemaVersion: 1,
            kind: "resume",
            sections: [
              {
                id: "00000000-0000-4000-8000-000000000003",
                type: "summary",
                heading: "Summary",
                blocks: [
                  {
                    id: "00000000-0000-4000-8000-000000000004",
                    type: "paragraph",
                    text: "Two words",
                  },
                ],
              },
            ],
          }}
        />,
      );
    });
    expect(container.textContent).toMatch(/2 words/u);
    const text = container.querySelector("textarea");
    expect(text).not.toBeNull();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(text, "Three clear words");
      text?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toMatch(/3 words/u);
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });
});
