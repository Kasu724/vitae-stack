import { describe, expect, it } from "vitest";

import {
  lexicalTokens,
  matchEvidenceDeterministically,
} from "../../src/modules/matching/domain";

describe("deterministic evidence matching", () => {
  it("normalizes terms and excludes common words", () => {
    expect(lexicalTokens("Build accessible systems with PostgreSQL")).toEqual([
      "build",
      "accessible",
      "systems",
      "postgresql",
    ]);
  });

  it("classifies direct skill, combined evidence, weak evidence, and gaps", () => {
    const results = matchEvidenceDeterministically(
      [
        { id: "req-skill", text: "Experience with PostgreSQL" },
        {
          id: "req-combined",
          text: "secure accessible distributed systems",
        },
        { id: "req-gap", text: "Kubernetes cluster administration" },
      ],
      [
        {
          id: "fact-skill",
          type: "skill",
          displayText: "PostgreSQL",
          value: { kind: "skill", name: "PostgreSQL" },
        },
        {
          id: "fact-a",
          type: "statement",
          displayText: "Secure accessible interfaces",
          value: { kind: "text", text: "Secure accessible interfaces" },
        },
        {
          id: "fact-b",
          type: "statement",
          displayText: "Distributed systems",
          value: {
            kind: "text",
            text: "Distributed systems",
          },
        },
      ],
    );
    expect(
      results.find((item) => item.requirementId === "req-skill"),
    ).toMatchObject({ strength: "direct", exactSkill: true });
    expect(
      results
        .filter((item) => item.requirementId === "req-combined")
        .map((item) => item.strength),
    ).toEqual(["combined", "combined"]);
    expect(results.some((item) => item.requirementId === "req-gap")).toBe(
      false,
    );
  });

  it("orders equal-scored candidates by immutable fact ID", () => {
    const results = matchEvidenceDeterministically(
      [{ id: "requirement", text: "secure platform systems" }],
      [
        {
          id: "fact-z",
          type: "statement",
          displayText: "secure platform",
          value: { kind: "text", text: "secure platform" },
        },
        {
          id: "fact-a",
          type: "statement",
          displayText: "secure platform",
          value: { kind: "text", text: "secure platform" },
        },
      ],
    );
    expect(results.map((item) => item.evidenceFactId)).toEqual([
      "fact-a",
      "fact-z",
    ]);
  });
});
