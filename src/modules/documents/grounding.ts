import { contentHash } from "./hash";
import type { CanonicalDocument } from "./document-schema";

export const GROUNDING_POLICY_VERSION = "exact-approved-assertion@1" as const;

export interface GroundingEvidence {
  id: string;
  displayText: string;
  value: unknown;
  factStatus?: string;
  entryStatus?: string;
}

export interface DocumentGroundingClaim {
  id: string;
  stableBlockId: string;
  startOffset: number;
  endOffset: number;
  textHash: string;
  status: "supported" | "unverified" | "nonfactual";
  relation?: "direct" | "combines" | "paraphrases";
  evidence: GroundingEvidence[];
}

export interface DocumentGroundingAssessment {
  structuralIssueIds: string[];
  unsupportedClaimIds: string[];
}

function normalizeAssertion(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function numericTokens(value: string): string[] {
  return value.match(/\b\d+(?:[.,]\d+)?%?\b/gu) ?? [];
}

export function claimIsGrounded(
  claimText: string,
  evidence: ReadonlyArray<Pick<GroundingEvidence, "displayText" | "value">>,
): boolean {
  const normalizedClaim = normalizeAssertion(claimText);
  const assertions = evidence
    .map((item) => item.displayText.trim())
    .filter(Boolean);
  if (!normalizedClaim || assertions.length === 0) return false;
  if (
    assertions.some(
      (assertion) => normalizeAssertion(assertion) === normalizedClaim,
    )
  )
    return true;
  if (assertions.length > 4) return false;

  const permutations = (values: string[]): string[][] =>
    values.length <= 1
      ? [values]
      : values.flatMap((value, index) =>
          permutations(
            values.filter((_, itemIndex) => itemIndex !== index),
          ).map((rest) => [value, ...rest]),
        );
  return permutations(assertions).some((ordered) =>
    [" ", " and ", "; ", ", "].some(
      (separator) =>
        normalizeAssertion(ordered.join(separator)) === normalizedClaim,
    ),
  );
}

export function isMaterialCharacter(character: string): boolean {
  return !/\s|[.,;:()\-]/u.test(character);
}

const repositoryOwnedHeadings: Readonly<Record<string, ReadonlySet<string>>> = {
  contact: new Set(["Contact"]),
  summary: new Set(["Summary"]),
  experience: new Set(["Experience"]),
  education: new Set(["Education"]),
  skills: new Set(["Skills"]),
  project: new Set(["Projects"]),
  custom: new Set(),
  header: new Set(["Header"]),
  salutation: new Set(),
  body: new Set(),
  closing: new Set(),
};

export function assessDocumentGrounding(
  document: CanonicalDocument,
  claims: readonly DocumentGroundingClaim[],
): DocumentGroundingAssessment {
  const structural = new Set<string>();
  const unsupported = new Set<string>();

  for (const section of document.sections) {
    if (
      section.heading &&
      !repositoryOwnedHeadings[section.type]?.has(section.heading)
    ) {
      const issueId = `untracked-heading:${section.id}`;
      structural.add(issueId);
      unsupported.add(issueId);
    }
  }

  const blocks = new Map(
    document.sections.flatMap((section) =>
      section.blocks.map((block) => [block.id, block.text] as const),
    ),
  );
  const claimsByBlock = new Map<string, DocumentGroundingClaim[]>();

  for (const claim of claims) {
    if (!blocks.has(claim.stableBlockId)) {
      structural.add(claim.id);
      unsupported.add(claim.id);
      continue;
    }
    const current = claimsByBlock.get(claim.stableBlockId) ?? [];
    current.push(claim);
    claimsByBlock.set(claim.stableBlockId, current);
  }

  for (const [blockId, text] of blocks) {
    const coverage = Array.from({ length: text.length }, () => false);
    const blockClaims = [...(claimsByBlock.get(blockId) ?? [])].sort(
      (left, right) => left.startOffset - right.startOffset,
    );
    let previousEnd = 0;

    for (const claim of blockClaims) {
      const validAnchor =
        Number.isInteger(claim.startOffset) &&
        Number.isInteger(claim.endOffset) &&
        claim.startOffset >= 0 &&
        claim.endOffset > claim.startOffset &&
        claim.endOffset <= text.length &&
        claim.startOffset >= previousEnd;
      if (!validAnchor) {
        structural.add(claim.id);
        unsupported.add(claim.id);
        continue;
      }
      previousEnd = claim.endOffset;
      const claimText = text.slice(claim.startOffset, claim.endOffset);
      if (contentHash(claimText) !== claim.textHash) {
        structural.add(claim.id);
        unsupported.add(claim.id);
        continue;
      }
      for (let index = claim.startOffset; index < claim.endOffset; index += 1)
        coverage[index] = true;

      if (claim.status === "unverified") unsupported.add(claim.id);
      const uniqueEvidenceIds = new Set(claim.evidence.map((item) => item.id));
      if (
        claim.relation &&
        (uniqueEvidenceIds.size !== claim.evidence.length ||
          (claim.relation === "combines"
            ? uniqueEvidenceIds.size < 2
            : uniqueEvidenceIds.size !== 1))
      )
        unsupported.add(claim.id);
      if (
        claim.status === "supported" &&
        (claim.evidence.length === 0 ||
          claim.evidence.some(
            (item) =>
              item.factStatus !== "approved" || item.entryStatus !== "active",
          ) ||
          !claimIsGrounded(claimText, claim.evidence))
      )
        unsupported.add(claim.id);
    }

    let hasUntrackedText = false;
    for (let index = 0; index < text.length; index += 1)
      if (isMaterialCharacter(text[index]!) && !coverage[index]) {
        hasUntrackedText = true;
        break;
      }
    if (hasUntrackedText) {
      const issueId = `untracked-block:${blockId}`;
      structural.add(issueId);
      unsupported.add(issueId);
    }
  }

  return {
    structuralIssueIds: [...structural].sort(),
    unsupportedClaimIds: [...unsupported].sort(),
  };
}

export function assessTextGrounding(
  text: string,
  claims: readonly Omit<DocumentGroundingClaim, "stableBlockId">[],
): DocumentGroundingAssessment {
  const blockId = "grounding-text-block";
  return assessDocumentGrounding(
    {
      schemaVersion: 1,
      kind: "resume",
      sections: [
        {
          id: "grounding-text-section",
          type: "custom",
          blocks: [{ id: blockId, type: "paragraph", text }],
        },
      ],
    },
    claims.map((claim) => ({ ...claim, stableBlockId: blockId })),
  );
}

export function groundingStateHash(
  claims: readonly DocumentGroundingClaim[],
  unsupportedClaimIds: readonly string[],
): string {
  return contentHash({
    policyVersion: GROUNDING_POLICY_VERSION,
    claims: [...claims]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((claim) => ({
        id: claim.id,
        stableBlockId: claim.stableBlockId,
        startOffset: claim.startOffset,
        endOffset: claim.endOffset,
        textHash: claim.textHash,
        status: claim.status,
        ...(claim.relation ? { relation: claim.relation } : {}),
        evidence: [...claim.evidence]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((evidence) => ({
            id: evidence.id,
            displayText: evidence.displayText,
            value: evidence.value,
            factStatus: evidence.factStatus ?? null,
            entryStatus: evidence.entryStatus ?? null,
          })),
      })),
    unsupportedClaimIds: [...unsupportedClaimIds].sort(),
  });
}
