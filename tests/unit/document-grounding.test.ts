import { describe, expect, it } from "vitest";

import {
  assessDocumentGrounding,
  assessTextGrounding,
  claimIsGrounded,
  type DocumentGroundingClaim,
} from "@/modules/documents/grounding";
import { createInitialDocument } from "@/modules/documents/document-schema";
import { contentHash } from "@/modules/documents/hash";

function supportedClaim(
  blockId: string,
  text: string,
  overrides: Partial<DocumentGroundingClaim> = {},
): DocumentGroundingClaim {
  return {
    id: crypto.randomUUID(),
    stableBlockId: blockId,
    startOffset: 0,
    endOffset: text.length,
    textHash: contentHash(text),
    status: "supported",
    evidence: [
      {
        id: crypto.randomUUID(),
        displayText: text,
        value: { kind: "text", text },
        factStatus: "approved",
        entryStatus: "active",
      },
    ],
    ...overrides,
  };
}

describe("document grounding policy", () => {
  it("requires exact approved assertions instead of lexical overlap", () => {
    const evidence = [
      {
        displayText: "Improved onboarding completion by 20%",
        value: { kind: "metric", value: 20, unit: "%" },
      },
    ];

    expect(
      claimIsGrounded("Improved onboarding completion by 20%", evidence),
    ).toBe(true);
    expect(
      claimIsGrounded(
        "Improved onboarding completion by 20% and managed payroll systems",
        evidence,
      ),
    ).toBe(false);
    expect(
      claimIsGrounded("Did not improve onboarding completion by 20%", evidence),
    ).toBe(false);
    expect(claimIsGrounded("I", evidence)).toBe(false);
    expect(
      claimIsGrounded("improved onboarding completion by 20%", evidence),
    ).toBe(false);
    expect(
      claimIsGrounded("Improved onboarding completion by 20%.", evidence),
    ).toBe(false);
  });

  it("allows only an exact bounded composition of approved assertions", () => {
    const evidence = [
      { displayText: "Built the API", value: null },
      { displayText: "Reduced latency by 20%", value: null },
    ];
    expect(
      claimIsGrounded("Built the API and Reduced latency by 20%", evidence),
    ).toBe(true);
    expect(
      claimIsGrounded(
        "Built the API and Reduced latency by 20% as engineering lead",
        evidence,
      ),
    ).toBe(false);

    const composed = "Built the API and Reduced latency by 20%";
    const claim = supportedClaim("unused", composed, {
      relation: "combines",
      evidence: evidence.map((item) => ({
        id: crypto.randomUUID(),
        ...item,
        factStatus: "approved",
        entryStatus: "active",
      })),
    });
    const textClaim: Omit<DocumentGroundingClaim, "stableBlockId"> = {
      id: claim.id,
      startOffset: claim.startOffset,
      endOffset: claim.endOffset,
      textHash: claim.textHash,
      status: claim.status,
      ...(claim.relation ? { relation: claim.relation } : {}),
      evidence: claim.evidence,
    };
    expect(
      assessTextGrounding(composed, [textClaim]).unsupportedClaimIds,
    ).toEqual([]);
    textClaim.relation = "direct";
    expect(
      assessTextGrounding(composed, [textClaim]).unsupportedClaimIds,
    ).toEqual([textClaim.id]);
  });

  it("fails closed for missing, partial, stale, overlapping, and unknown claims", () => {
    const document = createInitialDocument("resume");
    const block = document.sections[1]!.blocks[0]!;
    block.text = "Built the API";

    expect(assessDocumentGrounding(document, []).unsupportedClaimIds).toEqual([
      `untracked-block:${block.id}`,
    ]);

    const exact = supportedClaim(block.id, block.text);
    expect(assessDocumentGrounding(document, [exact])).toEqual({
      structuralIssueIds: [],
      unsupportedClaimIds: [],
    });

    const partial = supportedClaim(block.id, "Built", { endOffset: 5 });
    expect(
      assessDocumentGrounding(document, [partial]).unsupportedClaimIds,
    ).toContain(`untracked-block:${block.id}`);

    const stale = supportedClaim(block.id, block.text, {
      textHash: contentHash("Built a different API"),
    });
    expect(assessDocumentGrounding(document, [stale])).toMatchObject({
      structuralIssueIds: expect.arrayContaining([stale.id]),
      unsupportedClaimIds: expect.arrayContaining([stale.id]),
    });

    const overlap = supportedClaim(block.id, "the API", {
      startOffset: 6,
      endOffset: block.text.length,
    });
    expect(assessDocumentGrounding(document, [exact, overlap])).toMatchObject({
      structuralIssueIds: expect.arrayContaining([overlap.id]),
      unsupportedClaimIds: expect.arrayContaining([overlap.id]),
    });

    const unknown = supportedClaim(crypto.randomUUID(), block.text);
    expect(assessDocumentGrounding(document, [unknown])).toMatchObject({
      structuralIssueIds: expect.arrayContaining([unknown.id]),
      unsupportedClaimIds: expect.arrayContaining([unknown.id]),
    });
  });

  it("rejects ineligible evidence and visible headings outside the claim model", () => {
    const document = createInitialDocument("resume");
    const section = document.sections[1]!;
    const block = section.blocks[0]!;
    block.text = "Built the API";
    section.heading = "MIT PhD";
    const claim = supportedClaim(block.id, block.text);
    claim.evidence[0]!.factStatus = "retired";

    expect(assessDocumentGrounding(document, [claim])).toMatchObject({
      structuralIssueIds: [`untracked-heading:${section.id}`],
      unsupportedClaimIds: expect.arrayContaining([
        claim.id,
        `untracked-heading:${section.id}`,
      ]),
    });
  });

  it("accepts explicitly classified nonfactual text with complete anchors", () => {
    const document = createInitialDocument("cover_letter");
    const block = document.sections[1]!.blocks[0]!;
    block.text = "Dear Hiring Team,";
    const claim = supportedClaim(block.id, block.text, {
      status: "nonfactual",
      evidence: [],
    });

    expect(assessDocumentGrounding(document, [claim])).toEqual({
      structuralIssueIds: [],
      unsupportedClaimIds: [],
    });
  });
});
