import { describe, expect, it } from "vitest";

import {
  careerEntryInputSchema,
  careerEntryTypes,
  careerSectionForEntryType,
  factProposalInputSchema,
  normalizePartialDate,
  parseTags,
} from "@/modules/career/domain";

describe("career domain validation", () => {
  it("accepts every documented MVP entry type", () => {
    expect(careerEntryTypes).toHaveLength(16);
    for (const type of careerEntryTypes) {
      expect(
        careerEntryInputSchema.parse({ type, title: "Synthetic entry" }).type,
      ).toBe(type);
    }
  });

  it("normalizes typed partial dates without inventing precision", () => {
    expect(normalizePartialDate("2024")).toEqual({
      date: "2024-01-01",
      precision: "year",
    });
    expect(normalizePartialDate("2024-06")).toEqual({
      date: "2024-06-01",
      precision: "month",
    });
    expect(normalizePartialDate("2024-06-29")).toEqual({
      date: "2024-06-29",
      precision: "day",
    });
    expect(() => normalizePartialDate("2024-02-31")).toThrow();
  });

  it("rejects contradictory dates and current/end-date pairs", () => {
    expect(() =>
      careerEntryInputSchema.parse({
        type: "work",
        title: "Synthetic",
        startDate: "2025",
        endDate: "2024",
      }),
    ).toThrow();
    expect(() =>
      careerEntryInputSchema.parse({
        type: "work",
        title: "Synthetic",
        isCurrent: true,
        endDate: "2024",
      }),
    ).toThrow();
  });

  it("requires a numeric value, unit, and context for metrics", () => {
    expect(
      factProposalInputSchema.parse({
        type: "metric",
        displayText: "Reduced latency by 20 percent",
        value: {
          kind: "metric",
          value: 20,
          unit: "%",
          context: "API p95 latency",
        },
        sourceLocator: { kind: "manual", label: "Manual entry" },
      }).value,
    ).toMatchObject({ kind: "metric", value: 20 });
    expect(() =>
      factProposalInputSchema.parse({
        type: "metric",
        displayText: "Improved latency",
        value: { kind: "metric", value: Number.NaN, unit: "", context: "" },
        sourceLocator: { kind: "manual", label: "Manual entry" },
      }),
    ).toThrow();
  });

  it("normalizes and deduplicates tags", () => {
    expect(parseTags("TypeScript, Security, typescript,  ")).toEqual([
      "typescript",
      "security",
    ]);
  });

  it("groups entry types into stable career-bank sections", () => {
    expect(careerSectionForEntryType("work")).toBe("experience");
    expect(careerSectionForEntryType("internship")).toBe("experience");
    expect(careerSectionForEntryType("project")).toBe("projects");
    expect(careerSectionForEntryType("education")).toBe("education");
    expect(careerSectionForEntryType("skill")).toBe("skills");
  });

  it("validates item-specific education and project attributes", () => {
    const education = careerEntryInputSchema.parse({
      type: "education",
      title: "Synthetic degree",
      attributes: {
        major: "Computer Science",
        minor: "Mathematics",
        relevantCourses: ["Compilers", "Security", "Compilers"],
        awards: ["Synthetic scholarship"],
        technologies: [],
      },
    });
    expect(education.attributes.relevantCourses).toEqual([
      "Compilers",
      "Security",
    ]);
  });
});
