import { describe, expect, it } from "vitest";

import type { CanonicalDocument } from "../../src/modules/documents/document-schema";
import {
  analyzeAts,
  atsCategories,
  type AtsClaimInput,
  type AtsRequirementInput,
  type AtsSupportInput,
} from "../../src/modules/ats/domain";

const ids = {
  contactSection: "10000000-0000-4000-8000-000000000001",
  contactBlock: "10000000-0000-4000-8000-000000000002",
  experienceSection: "20000000-0000-4000-8000-000000000001",
  firstBullet: "20000000-0000-4000-8000-000000000002",
  secondBullet: "20000000-0000-4000-8000-000000000003",
  firstClaim: "30000000-0000-4000-8000-000000000001",
  secondClaim: "30000000-0000-4000-8000-000000000002",
  evidence: "40000000-0000-4000-8000-000000000001",
  required: "50000000-0000-4000-8000-000000000001",
  preferred: "50000000-0000-4000-8000-000000000002",
  responsibility: "50000000-0000-4000-8000-000000000003",
};

function fixture(): {
  document: CanonicalDocument;
  requirements: AtsRequirementInput[];
  claims: AtsClaimInput[];
  support: AtsSupportInput[];
} {
  const first =
    "Built distributed TypeScript services in 2024, improving onboarding by 20%.";
  const second = "Led accessible product delivery with security reviews.";
  return {
    document: {
      schemaVersion: 1,
      kind: "resume",
      sections: [
        {
          id: ids.contactSection,
          type: "contact",
          heading: "Contact",
          blocks: [
            {
              id: ids.contactBlock,
              type: "contact",
              text: "alex@example.test",
            },
          ],
        },
        {
          id: ids.experienceSection,
          type: "experience",
          heading: "Experience",
          blocks: [
            { id: ids.firstBullet, type: "bullet", text: first },
            { id: ids.secondBullet, type: "bullet", text: second },
          ],
        },
      ],
    },
    requirements: [
      {
        id: ids.required,
        text: "TypeScript services",
        category: "required_qualification",
        priority: "required",
      },
      {
        id: ids.preferred,
        text: "accessible product delivery",
        category: "preferred_qualification",
        priority: "preferred",
      },
      {
        id: ids.responsibility,
        text: "security reviews",
        category: "responsibility",
        priority: "required",
      },
    ],
    claims: [
      {
        id: ids.firstClaim,
        blockId: ids.firstBullet,
        start: 0,
        end: first.length,
        status: "supported",
        evidence: [{ id: ids.evidence, status: "approved" }],
      },
      {
        id: ids.secondClaim,
        blockId: ids.secondBullet,
        start: 0,
        end: second.length,
        status: "supported",
        evidence: [{ id: ids.evidence, status: "approved" }],
      },
    ],
    support: [
      {
        requirementId: ids.required,
        evidenceFactId: ids.evidence,
        strength: "direct",
      },
      {
        requirementId: ids.preferred,
        evidenceFactId: ids.evidence,
        strength: "direct",
      },
      {
        requirementId: ids.responsibility,
        evidenceFactId: ids.evidence,
        strength: "direct",
      },
    ],
  };
}

describe("deterministic estimated ATS analysis", () => {
  it("evaluates all documented categories with weights totaling 100", () => {
    expect(atsCategories.reduce((sum, category) => sum + category[2], 0)).toBe(
      100,
    );
    const analysis = analyzeAts(fixture());
    expect(analysis.categories).toHaveLength(15);
    expect(analysis.evaluatedWeight).toBe(100);
    expect(analysis.overallScoreBasisPoints).not.toBeNull();
    expect(analysis.blockerCount).toBe(0);
    expect(
      analysis.categories.every(
        (category) => category.scoreBasisPoints !== null,
      ),
    ).toBe(true);
  });

  it("returns byte-for-byte equivalent structured results for identical inputs", () => {
    const input = fixture();
    expect(analyzeAts(input)).toEqual(analyzeAts(structuredClone(input)));
  });

  it("gives combined evidence bounded credit and direct evidence full credit", () => {
    const input = fixture();
    input.support[0]!.strength = "combined";
    const analysis = analyzeAts(input);
    const required = analysis.categories.find(
      (category) => category.category === "required",
    );
    expect(required?.scoreBasisPoints).toBe(7_500);
    expect(
      analysis.findings.find((finding) => finding.ruleId === "ATS-REQ-001")
        ?.measured,
    ).toEqual({ support: "combined" });
  });

  it("blocks an unverified factual claim independently of the numeric estimate", () => {
    const input = fixture();
    input.claims[1]!.status = "unverified";
    input.claims[1]!.evidence = [];
    const analysis = analyzeAts(input);
    expect(analysis.blockerCount).toBe(1);
    expect(analysis.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "ATS-UNSUP-001",
        blocker: true,
        severity: "high",
      }),
    );
  });

  it("suppresses the overall score when evaluated category weight is below 80", () => {
    const input = fixture();
    input.requirements = [];
    input.claims = [];
    input.support = [];
    input.document.sections[1]!.blocks = [
      {
        id: ids.firstBullet,
        type: "paragraph",
        text: "Short profile without a date or tracked factual claim.",
      },
    ];
    const analysis = analyzeAts(input);
    expect(analysis.evaluatedWeight).toBeLessThan(80);
    expect(analysis.overallScoreBasisPoints).toBeNull();
  });

  it("keeps all score outputs within documented bounds across adverse fixtures", () => {
    for (const repeated of [0, 1, 10, 100]) {
      const input = fixture();
      input.document.sections[1]!.blocks[0]!.text = `${"typescript ".repeat(repeated)}unknown`;
      input.claims[0]!.status = "unverified";
      input.claims[0]!.evidence = [];
      const analysis = analyzeAts(input);
      for (const category of analysis.categories) {
        expect(category.earnedPoints).toBeGreaterThanOrEqual(0);
        expect(category.earnedPoints).toBeLessThanOrEqual(
          category.applicablePoints,
        );
        if (category.scoreBasisPoints !== null) {
          expect(category.scoreBasisPoints).toBeGreaterThanOrEqual(0);
          expect(category.scoreBasisPoints).toBeLessThanOrEqual(10_000);
        }
      }
    }
  });
});
