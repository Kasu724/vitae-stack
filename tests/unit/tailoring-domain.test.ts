import { describe, expect, it } from "vitest";

import {
  coverLetterPlanSchema,
  resumeBulletSuggestionSchema,
  resumeSectionPlanSchema,
  validateResumeBulletSuggestion,
  validateCoverLetterPlan,
  validateResumeSectionPlan,
} from "../../src/modules/tailoring/domain";

const sectionId = "10000000-0000-4000-8000-000000000001";
const blockId = "20000000-0000-4000-8000-000000000001";
const requirementId = "30000000-0000-4000-8000-000000000001";
const evidenceId = "40000000-0000-4000-8000-000000000001";
const text = "Improved onboarding completion by 20%";

function validBullet() {
  return resumeBulletSuggestionSchema.parse({
    schemaVersion: "ai-06.v1",
    operation: "replace_block_text",
    targetBlockId: blockId,
    text,
    claims: [
      {
        start: 0,
        end: text.length,
        evidenceFactIds: [evidenceId],
        relation: "direct",
      },
    ],
    requirementIds: [requirementId],
    explanation: "Uses the approved impact metric.",
  });
}

function validationInput() {
  return {
    targetBlockId: blockId,
    allowedRequirementIds: new Set([requirementId]),
    evidence: new Map([
      [
        evidenceId,
        {
          id: evidenceId,
          displayText: text,
          value: { metric: "20%" },
        },
      ],
    ]),
    support: [
      {
        evidenceFactId: evidenceId,
        requirementId,
        strength: "direct" as const,
      },
    ],
  };
}

describe("resume tailoring hard validation", () => {
  it("accepts a fully covered claim backed by selected strong evidence", () => {
    expect(() =>
      validateResumeBulletSuggestion(validBullet(), validationInput()),
    ).not.toThrow();
  });

  it("rejects unknown evidence and evidence without strong requirement support", () => {
    const unknown = validBullet();
    unknown.claims[0]!.evidenceFactIds = [
      "50000000-0000-4000-8000-000000000001",
    ];
    expect(() =>
      validateResumeBulletSuggestion(unknown, validationInput()),
    ).toThrow("unknown or unselected evidence");

    const unsupported = validationInput();
    unsupported.support = [];
    expect(() =>
      validateResumeBulletSuggestion(validBullet(), unsupported),
    ).toThrow("not an included strong match");
  });

  it("rejects unsupported numbers and uncovered factual text", () => {
    const metric = validBullet();
    metric.text = "Improved onboarding completion by 75%";
    metric.claims[0]!.end = metric.text.length;
    expect(() =>
      validateResumeBulletSuggestion(metric, validationInput()),
    ).toThrow("unsupported numeric value");

    const uncovered = validBullet();
    uncovered.claims[0]!.end = 8;
    expect(() =>
      validateResumeBulletSuggestion(uncovered, validationInput()),
    ).toThrow("not fully covered");
  });

  it("rejects an unrelated unsupported clause appended to grounded text", () => {
    const suggestion = validBullet();
    suggestion.text = `${text} and earned a PhD from MIT`;
    suggestion.claims[0]!.end = suggestion.text.length;

    expect(() =>
      validateResumeBulletSuggestion(suggestion, validationInput()),
    ).toThrow("not sufficiently entailed");
  });

  it("rejects inconsistent section plans and unknown identifiers", () => {
    const plan = resumeSectionPlanSchema.parse({
      schemaVersion: "ai-05.v1",
      includedSectionIds: [sectionId],
      orderedSectionIds: [sectionId],
      gaps: [],
      explanation: "Keep the relevant experience section.",
    });
    expect(() =>
      validateResumeSectionPlan(
        plan,
        new Set([sectionId]),
        new Set([requirementId]),
      ),
    ).not.toThrow();
    plan.orderedSectionIds = ["60000000-0000-4000-8000-000000000001"];
    expect(() =>
      validateResumeSectionPlan(
        plan,
        new Set([sectionId]),
        new Set([requirementId]),
      ),
    ).toThrow("unknown or inconsistent identifier");
  });

  it("accepts only cover-letter plan IDs with strong evidence support", () => {
    const plan = coverLetterPlanSchema.parse({
      schemaVersion: "ai-07.v1",
      paragraphs: [
        {
          targetBlockId: blockId,
          purpose: "evidence",
          requirementIds: [requirementId],
          evidenceFactIds: [evidenceId],
        },
      ],
      gaps: [],
      explanation: "Use the relevant evidence paragraph.",
    });
    const input = {
      allowedBlockIds: new Set([blockId]),
      allowedRequirementIds: new Set([requirementId]),
      evidence: new Set([evidenceId]),
      support: validationInput().support,
    };
    expect(() => validateCoverLetterPlan(plan, input)).not.toThrow();
    plan.paragraphs[0]!.evidenceFactIds = [
      "70000000-0000-4000-8000-000000000001",
    ];
    expect(() => validateCoverLetterPlan(plan, input)).toThrow(
      "unknown or unsupported identifier",
    );
  });
});
