import { describe, expect, it } from "vitest";

import {
  aiExtractionJsonSchema,
  aiExtractionOutputSchema,
  aiProposalEvidenceValue,
  deterministicLineCandidates,
  deterministicStructuredCandidates,
  sourceEntryTitle,
  validateExtractionSourceSpans,
} from "@/modules/extraction/domain";

describe("deterministic extraction fallback", () => {
  it("preserves normalized source line numbers while removing list markers", () => {
    expect(
      deterministicLineCandidates(
        "Heading\n\n- Built a synthetic parser\n• Reduced a synthetic delay\n1. Reviewed evidence",
      ),
    ).toEqual([
      { line: 1, text: "Heading" },
      { line: 3, text: "Built a synthetic parser" },
      { line: 4, text: "Reduced a synthetic delay" },
      { line: 5, text: "Reviewed evidence" },
    ]);
  });

  it("bounds candidate count and derives a safe entry title", () => {
    const lines = Array.from({ length: 120 }, (_, index) => `Fact ${index}`);
    expect(deterministicLineCandidates(lines.join("\n"))).toHaveLength(100);
    expect(sourceEntryTitle("synthetic.resume.pdf")).toBe("synthetic.resume");
    expect(sourceEntryTitle(".txt")).toBe("Imported career evidence");
    expect(deterministicLineCandidates("x".repeat(5001))).toEqual([]);
  });

  it("groups deterministic fallback facts by section and item", () => {
    const candidates = deterministicStructuredCandidates(
      [
        "EXPERIENCE",
        "Synthetic Labs — Engineer",
        "- Built a local parser",
        "",
        "Example Co — Intern",
        "- Shipped a safe import flow",
        "",
        "PROJECTS",
        "Private Portfolio",
        "- Used TypeScript",
      ].join("\n"),
      "Imported resume",
    );
    expect(
      candidates.map(({ entryType, entryKey, entryTitle }) => ({
        entryType,
        entryKey,
        entryTitle,
      })),
    ).toEqual([
      {
        entryType: "work",
        entryKey: "work_1",
        entryTitle: "Synthetic Labs — Engineer",
      },
      {
        entryType: "work",
        entryKey: "work_1",
        entryTitle: "Synthetic Labs — Engineer",
      },
      {
        entryType: "work",
        entryKey: "work_2",
        entryTitle: "Example Co — Intern",
      },
      {
        entryType: "work",
        entryKey: "work_2",
        entryTitle: "Example Co — Intern",
      },
      {
        entryType: "project",
        entryKey: "project_1",
        entryTitle: "Private Portfolio",
      },
      {
        entryType: "project",
        entryKey: "project_1",
        entryTitle: "Private Portfolio",
      },
    ]);
  });
});

describe("AI extraction boundary", () => {
  const source = "Synthetic Employer\nBuilt synthetic systems\nTypeScript";
  const proposal = {
    entryKey: "entry_1",
    entryType: "work" as const,
    entryTitleStart: source.indexOf("Synthetic Employer"),
    entryTitleEnd:
      source.indexOf("Synthetic Employer") + "Synthetic Employer".length,
    entryTitleText: "Synthetic Employer",
    factType: "statement" as const,
    sourceStart: source.indexOf("Built synthetic systems"),
    sourceEnd:
      source.indexOf("Built synthetic systems") +
      "Built synthetic systems".length,
    sourceText: "Built synthetic systems",
  };

  it("accepts only closed exact-span AI-01 output", () => {
    const output = aiExtractionOutputSchema.parse({
      schemaVersion: "ai-01.v1",
      proposals: [proposal],
      warnings: [],
    });
    expect(() =>
      validateExtractionSourceSpans(source, output.proposals),
    ).not.toThrow();
    expect(aiProposalEvidenceValue(proposal)).toEqual({
      kind: "text",
      text: "Built synthetic systems",
    });
    expect(
      aiExtractionOutputSchema.safeParse({
        ...output,
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      aiExtractionOutputSchema.safeParse({
        ...output,
        proposals: [{ ...proposal, unexpected: true }],
      }).success,
    ).toBe(false);
    expect(aiExtractionJsonSchema.additionalProperties).toBe(false);
    expect(
      (
        aiExtractionJsonSchema.properties.proposals.items as {
          additionalProperties: boolean;
        }
      ).additionalProperties,
    ).toBe(false);
  });

  it("rejects fabricated, duplicate, or inconsistently grouped spans", () => {
    expect(() =>
      validateExtractionSourceSpans(source, [
        { ...proposal, sourceText: "Invented systems" },
      ]),
    ).toThrow("source span");
    expect(() =>
      validateExtractionSourceSpans(source, [proposal, proposal]),
    ).toThrow("duplicate");
    expect(() =>
      validateExtractionSourceSpans(source, [
        proposal,
        {
          ...proposal,
          factType: "skill",
          sourceStart: source.indexOf("TypeScript"),
          sourceEnd: source.indexOf("TypeScript") + "TypeScript".length,
          sourceText: "TypeScript",
          entryTitleStart: source.indexOf("Built synthetic systems"),
          entryTitleEnd:
            source.indexOf("Built synthetic systems") +
            "Built synthetic systems".length,
          entryTitleText: "Built synthetic systems",
        },
      ]),
    ).toThrow("grouping");
  });
});
