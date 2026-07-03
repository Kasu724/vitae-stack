// @vitest-environment node

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import type { CanonicalDocument } from "../../src/modules/documents/document-schema";
import {
  orderedTokenCoverage,
  UnsupportedExportClaimsError,
} from "../../src/modules/exports/domain";
import { renderExport } from "../../src/modules/exports/renderers";
import { parseSourceBuffer } from "../../src/modules/ingestion/parsers";

const document: CanonicalDocument = {
  schemaVersion: 1,
  kind: "resume",
  sections: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      type: "contact",
      heading: "Contact",
      blocks: [
        {
          id: "10000000-0000-4000-8000-000000000002",
          type: "contact",
          text: "Alex Example · alex@example.test",
        },
      ],
    },
    {
      id: "20000000-0000-4000-8000-000000000001",
      type: "experience",
      heading: "Experience",
      blocks: [
        {
          id: "20000000-0000-4000-8000-000000000002",
          type: "bullet",
          text: "Built maintainable systems with 20% less latency in 2025.",
        },
        {
          id: "20000000-0000-4000-8000-000000000003",
          type: "bullet",
          text: "Reviewed secure delivery controls for résumé exports.",
        },
      ],
    },
  ],
};

describe("safe fixed-template document renderers", () => {
  it("creates a selectable PDF with equivalent Unicode text", async () => {
    const result = await renderExport({
      title: "Synthetic résumé",
      format: "pdf",
      document,
      unsupportedClaimIds: [],
    });
    expect(result.bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const parsed = await parseSourceBuffer("application/pdf", result.bytes);
    expect(
      orderedTokenCoverage(result.sourceText, parsed.text),
    ).toBeGreaterThanOrEqual(0.98);
    expect(parsed.text).toContain("Alex Example · alex@example.test");
    expect(parsed.text).toContain("résumé exports");
    expect(result.classification).toBe("final");
  }, 20_000);

  it("creates a macro-free DOCX with semantic headings and lists", async () => {
    const result = await renderExport({
      title: "Synthetic résumé",
      format: "docx",
      document,
      unsupportedClaimIds: [],
    });
    const parsed = await parseSourceBuffer(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      result.bytes,
    );
    expect(
      orderedTokenCoverage(result.sourceText, parsed.text),
    ).toBeGreaterThanOrEqual(0.98);
    const zip = await JSZip.loadAsync(result.bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    const relationships = await Promise.all(
      Object.keys(zip.files)
        .filter((name) => name.endsWith(".rels"))
        .map((name) => zip.file(name)!.async("string")),
    );
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain("<w:numPr>");
    expect(relationships.join("\n")).not.toContain('TargetMode="External"');
    expect(Object.keys(zip.files)).not.toContain("word/vbaProject.bin");
  });

  it("blocks final binary formats and clearly labels permitted draft formats", async () => {
    await expect(
      renderExport({
        title: "Blocked",
        format: "pdf",
        document,
        unsupportedClaimIds: ["30000000-0000-4000-8000-000000000001"],
      }),
    ).rejects.toBeInstanceOf(UnsupportedExportClaimsError);
    await expect(
      renderExport({
        title: "Blocked",
        format: "docx",
        document,
        unsupportedClaimIds: ["30000000-0000-4000-8000-000000000001"],
      }),
    ).rejects.toBeInstanceOf(UnsupportedExportClaimsError);

    for (const format of ["markdown", "text", "json"] as const) {
      const result = await renderExport({
        title: "Draft",
        format,
        document,
        unsupportedClaimIds: ["30000000-0000-4000-8000-000000000001"],
      });
      expect(result.classification).toBe("draft");
      expect(result.bytes.toString("utf8")).toContain("DRAFT");
    }
  });

  it("neutralizes Markdown HTML and removes directional formatting controls", async () => {
    const adversarial = structuredClone(document);
    adversarial.sections[1]!.blocks[0]!.text =
      "Safe\u202E text </script><img src=x onerror=alert(1)>";
    const result = await renderExport({
      title: "Adversarial",
      format: "markdown",
      document: adversarial,
      unsupportedClaimIds: [],
    });
    const text = result.bytes.toString("utf8");
    expect(text).not.toContain("\u202E");
    expect(text).not.toMatch(/<\/?(?:script|img)\b/iu);
    expect(text).toContain("&lt;");
    expect(result.warnings).toContain(
      "Directional formatting controls were removed from the export.",
    );
  });
});
