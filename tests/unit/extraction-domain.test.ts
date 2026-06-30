import { describe, expect, it } from "vitest";

import {
  deterministicLineCandidates,
  sourceEntryTitle,
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
});
