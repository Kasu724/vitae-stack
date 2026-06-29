import { describe, expect, it } from "vitest";

import {
  canonicalDocumentSchema,
  compareDocumentContent,
  createInitialDocument,
  plainTextPaste,
} from "@/modules/documents/document-schema";

describe("canonical document schema", () => {
  it("creates valid resume and cover-letter documents with stable unique IDs", () => {
    for (const kind of ["resume", "cover_letter"] as const) {
      const document = createInitialDocument(kind);
      expect(canonicalDocumentSchema.parse(document)).toEqual(document);
      const ids = document.sections.flatMap((section) => [
        section.id,
        ...section.blocks.map((block) => block.id),
      ]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("rejects unknown nodes, duplicate IDs, and section types from another kind", () => {
    const resume = createInitialDocument("resume");
    expect(() =>
      canonicalDocumentSchema.parse({
        ...resume,
        sections: [
          resume.sections[0],
          { ...resume.sections[1], id: resume.sections[0]!.id },
        ],
      }),
    ).toThrow();
    expect(() =>
      canonicalDocumentSchema.parse({
        ...resume,
        sections: [{ ...resume.sections[0], type: "body" }],
      }),
    ).toThrow();
  });

  it("treats pasted markup as plain text and removes unsafe controls", () => {
    expect(plainTextPaste("<script>alert(1)</script>\r\ntext\u0000")).toBe(
      "<script>alert(1)</script>\ntext",
    );
  });

  it("reports stable section and block changes", () => {
    const before = createInitialDocument("resume");
    const after = structuredClone(before);
    after.sections[1]!.heading = "Profile";
    after.sections[1]!.blocks[0]!.text = "Synthetic summary";
    const diff = compareDocumentContent(before, after);
    expect(diff.changedSections).toEqual([before.sections[1]!.id]);
    expect(diff.changedBlocks).toEqual([before.sections[1]!.blocks[0]!.id]);
    expect(diff.addedBlocks).toEqual([]);
  });
});
