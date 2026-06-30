import { describe, expect, it } from "vitest";

import { normalizeJobText } from "@/modules/jobs/domain";

describe("job snapshot normalization", () => {
  it("normalizes line endings and whitespace deterministically", () => {
    const first = normalizeJobText(
      "  Role\r\nDuties   \r\n\r\n\r\n\r\nApply  ",
    );
    const second = normalizeJobText("Role\nDuties\n\n\nApply");
    expect(first.text).toBe("Role\nDuties\n\n\nApply");
    expect(first.hash).toBe(second.hash);
  });

  it("removes control-based visual spoofing and reports quality warnings", () => {
    const result = normalizeJobText("Engineer \u202erequired\u202c");
    expect(result.text).toBe("Engineer required");
    expect(result.warnings).toContain(
      "Bidirectional control characters were removed.",
    );
    expect(result.warnings).toContain(
      "The job description is short; later analysis may be incomplete.",
    );
  });

  it("rejects empty and oversized input", () => {
    expect(() => normalizeJobText("\0\n ")).toThrow(/empty/u);
    expect(() => normalizeJobText("x".repeat(500_001))).toThrow();
  });
});
