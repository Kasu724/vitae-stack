import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DocumentEditor } from "@/modules/documents/components/document-editor";

vi.mock("@/modules/documents/actions", () => ({
  commitDocumentVersionAction: vi.fn(),
}));

describe("document editor accessibility behavior", () => {
  it("labels editable blocks, reports words, and warns before losing a dirty draft", () => {
    vi.useFakeTimers();
    const view = render(
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
    expect(screen.getByText(/2 words/u)).toBeVisible();
    const text = screen.getByRole("textbox", { name: "Text" });
    fireEvent.change(text, { target: { value: "Three clear words" } });
    expect(screen.getByText(/3 words/u)).toBeVisible();
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
    view.unmount();
    vi.useRealTimers();
  });
});
