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

  it("recovers its autosave queue after a network failure", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("synthetic network failure"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ revision: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <DocumentEditor
          documentId="00000000-0000-4000-8000-000000000011"
          baseVersionId="00000000-0000-4000-8000-000000000012"
          initialDraftRevision={0}
          idempotencyKey="autosave-recovery"
          initialContent={{
            schemaVersion: 1,
            kind: "resume",
            sections: [
              {
                id: "00000000-0000-4000-8000-000000000013",
                type: "summary",
                heading: "Summary",
                blocks: [
                  {
                    id: "00000000-0000-4000-8000-000000000014",
                    type: "paragraph",
                    text: "Initial",
                  },
                ],
              },
            ],
          }}
        />,
      );
    });
    const text = container.querySelector("textarea")!;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setter?.call(text, "First edit");
      text.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(801);
    });
    expect(container.textContent).toContain("could not be saved");
    await act(async () => {
      setter?.call(text, "Second edit");
      text.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(801);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Draft saved.");
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("blocks version commit after a concurrent draft conflict", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "DRAFT_CONFLICT" }), {
        status: 409,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <DocumentEditor
          documentId="00000000-0000-4000-8000-000000000021"
          baseVersionId="00000000-0000-4000-8000-000000000022"
          initialDraftRevision={0}
          idempotencyKey="autosave-conflict"
          initialContent={{
            schemaVersion: 1,
            kind: "resume",
            sections: [
              {
                id: "00000000-0000-4000-8000-000000000023",
                type: "summary",
                heading: "Summary",
                blocks: [
                  {
                    id: "00000000-0000-4000-8000-000000000024",
                    type: "paragraph",
                    text: "Initial",
                  },
                ],
              },
            ],
          }}
        />,
      );
    });
    const text = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(text, "Conflicting edit");
      text.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(801);
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Saving is paused",
    );
    expect(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.disabled,
    ).toBe(true);
    expect(container.textContent).toContain("Reload server draft");
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("compares a conflicting server draft before explicitly reapplying local text", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "DRAFT_CONFLICT",
            server: {
              baseVersionId: "00000000-0000-4000-8000-000000000035",
              revision: 4,
              content: {
                schemaVersion: 1,
                kind: "resume",
                sections: [
                  {
                    id: "00000000-0000-4000-8000-000000000033",
                    type: "summary",
                    heading: "Summary",
                    blocks: [
                      {
                        id: "00000000-0000-4000-8000-000000000034",
                        type: "paragraph",
                        text: "Server edit",
                      },
                    ],
                  },
                ],
              },
              updatedAt: "2026-07-11T20:00:00.000Z",
              source: "draft",
            },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ revision: 5 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <DocumentEditor
          documentId="00000000-0000-4000-8000-000000000031"
          baseVersionId="00000000-0000-4000-8000-000000000032"
          initialDraftRevision={3}
          idempotencyKey="autosave-explicit-reapply"
          initialContent={{
            schemaVersion: 1,
            kind: "resume",
            sections: [
              {
                id: "00000000-0000-4000-8000-000000000033",
                type: "summary",
                heading: "Summary",
                blocks: [
                  {
                    id: "00000000-0000-4000-8000-000000000034",
                    type: "paragraph",
                    text: "Initial",
                  },
                ],
              },
            ],
          }}
        />,
      );
    });
    const text = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(text, "Local edit");
      text.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(801);
    });
    expect(container.textContent).toContain("Draft conflict comparison");
    expect(container.textContent).toContain("Local edit");
    expect(container.textContent).toContain("Server edit");
    const overwrite = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Overwrite server draft with this tab",
    );
    expect(overwrite).toBeDefined();
    await act(async () => {
      overwrite?.click();
      await vi.advanceTimersByTimeAsync(801);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      baseVersionId: string;
      expectedRevision: number;
      content: { sections: Array<{ blocks: Array<{ text: string }> }> };
    };
    expect(request).toMatchObject({
      baseVersionId: "00000000-0000-4000-8000-000000000035",
      expectedRevision: 4,
    });
    expect(request.content.sections[0]?.blocks[0]?.text).toBe("Local edit");
    expect(container.textContent).toContain("Draft saved.");
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
