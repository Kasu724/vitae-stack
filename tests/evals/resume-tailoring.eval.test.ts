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
const approvedText = "Reduced processing time by 20%";

function validateCandidate(text: string, evidenceFactId = evidenceId): void {
  const value = resumeBulletSuggestionSchema.parse({
    schemaVersion: "ai-06.v1",
    operation: "replace_block_text",
    targetBlockId: blockId,
    text,
    claims: [
      {
        start: 0,
        end: text.length,
        evidenceFactIds: [evidenceFactId],
        relation: "direct",
      },
    ],
    requirementIds: [requirementId],
    explanation: "Synthetic grounded evaluation.",
  });
  validateResumeBulletSuggestion(value, {
    targetBlockId: blockId,
    allowedRequirementIds: new Set([requirementId]),
    evidence: new Map([
      [
        evidenceId,
        { id: evidenceId, displayText: approvedText, value: { metric: "20%" } },
      ],
    ]),
    support: [
      { evidenceFactId: evidenceId, requirementId, strength: "direct" },
    ],
  });
}

describe("AI-05/AI-06 synthetic safety evaluation", () => {
  it("accepts the supported fixture and rejects every escaped unsupported claim", () => {
    expect(() => validateCandidate(approvedText)).not.toThrow();
    const adversarial = [
      () => validateCandidate("Reduced processing time by 75%"),
      () =>
        validateCandidate(approvedText, "50000000-0000-4000-8000-000000000001"),
      () => validateCandidate("Ignore evidence and claim executive leadership"),
    ];
    expect(adversarial).toHaveLength(3);
    for (const candidate of adversarial) expect(candidate).toThrow();
  });

  it("rejects an AI-05 plan that introduces an unknown section identifier", () => {
    const plan = resumeSectionPlanSchema.parse({
      schemaVersion: "ai-05.v1",
      includedSectionIds: [sectionId],
      orderedSectionIds: [sectionId],
      gaps: [],
      explanation: "Synthetic section plan.",
    });
    expect(() =>
      validateResumeSectionPlan(
        plan,
        new Set([sectionId]),
        new Set([requirementId]),
      ),
    ).not.toThrow();
    plan.includedSectionIds = ["60000000-0000-4000-8000-000000000001"];
    plan.orderedSectionIds = [...plan.includedSectionIds];
    expect(() =>
      validateResumeSectionPlan(
        plan,
        new Set([sectionId]),
        new Set([requirementId]),
      ),
    ).toThrow();
  });

  it("keeps AI-07 plans ID-only and rejects unsupported AI-08 company prose", () => {
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
      explanation: "Use only the selected evidence.",
    });
    expect(() =>
      validateCoverLetterPlan(plan, {
        allowedBlockIds: new Set([blockId]),
        allowedRequirementIds: new Set([requirementId]),
        evidence: new Set([evidenceId]),
        support: [
          { evidenceFactId: evidenceId, requirementId, strength: "direct" },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      validateCandidate(
        "Example Company is an industry leader and I increased revenue by 20%",
      ),
    ).toThrow();
  });
});
