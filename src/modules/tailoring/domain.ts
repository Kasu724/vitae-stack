import { createHash } from "node:crypto";

import { z } from "zod";

import { lexicalTokens } from "@/modules/matching/domain";

export const resumeSectionPlanSchema = z
  .object({
    schemaVersion: z.literal("ai-05.v1"),
    includedSectionIds: z.array(z.string().uuid()).min(1).max(30),
    orderedSectionIds: z.array(z.string().uuid()).min(1).max(30),
    gaps: z
      .array(
        z
          .object({
            requirementId: z.string().uuid(),
            code: z.enum(["MISSING_EVIDENCE", "WEAK_EVIDENCE"]),
            detail: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(100),
    explanation: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const resumeSectionPlanJsonSchema = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["ai-05.v1"] },
    includedSectionIds: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: { type: "string" },
    },
    orderedSectionIds: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: { type: "string" },
    },
    gaps: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        properties: {
          requirementId: { type: "string" },
          code: { type: "string", enum: ["MISSING_EVIDENCE", "WEAK_EVIDENCE"] },
          detail: { type: "string", minLength: 1, maxLength: 500 },
        },
        required: ["requirementId", "code", "detail"],
        additionalProperties: false,
      },
    },
    explanation: { type: "string", minLength: 1, maxLength: 1000 },
  },
  required: [
    "schemaVersion",
    "includedSectionIds",
    "orderedSectionIds",
    "gaps",
    "explanation",
  ],
  additionalProperties: false,
} satisfies Record<string, unknown>;

const claimCandidateSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    evidenceFactIds: z.array(z.string().uuid()).min(1).max(10),
    relation: z.enum(["direct", "combines", "paraphrases"]),
  })
  .strict();

export const resumeBulletSuggestionSchema = z
  .object({
    schemaVersion: z.literal("ai-06.v1"),
    operation: z.literal("replace_block_text"),
    targetBlockId: z.string().uuid(),
    text: z.string().trim().min(1).max(2_000),
    claims: z.array(claimCandidateSchema).min(1).max(20),
    requirementIds: z.array(z.string().uuid()).min(1).max(20),
    explanation: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const resumeBulletSuggestionJsonSchema = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["ai-06.v1"] },
    operation: { type: "string", enum: ["replace_block_text"] },
    targetBlockId: { type: "string" },
    text: { type: "string", minLength: 1, maxLength: 2000 },
    claims: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          start: { type: "integer", minimum: 0 },
          end: { type: "integer", minimum: 1 },
          evidenceFactIds: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: { type: "string" },
          },
          relation: {
            type: "string",
            enum: ["direct", "combines", "paraphrases"],
          },
        },
        required: ["start", "end", "evidenceFactIds", "relation"],
        additionalProperties: false,
      },
    },
    requirementIds: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: { type: "string" },
    },
    explanation: { type: "string", minLength: 1, maxLength: 1000 },
  },
  required: [
    "schemaVersion",
    "operation",
    "targetBlockId",
    "text",
    "claims",
    "requirementIds",
    "explanation",
  ],
  additionalProperties: false,
} satisfies Record<string, unknown>;

export const coverLetterPlanSchema = z
  .object({
    schemaVersion: z.literal("ai-07.v1"),
    paragraphs: z
      .array(
        z
          .object({
            targetBlockId: z.string().uuid(),
            purpose: z.enum([
              "opening_evidence",
              "evidence",
              "closing_evidence",
            ]),
            requirementIds: z.array(z.string().uuid()).min(1).max(20),
            evidenceFactIds: z.array(z.string().uuid()).min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    gaps: z
      .array(
        z
          .object({
            requirementId: z.string().uuid(),
            code: z.enum(["MISSING_EVIDENCE", "WEAK_EVIDENCE"]),
            detail: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(100),
    explanation: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const coverLetterPlanJsonSchema = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["ai-07.v1"] },
    paragraphs: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          targetBlockId: { type: "string" },
          purpose: {
            type: "string",
            enum: ["opening_evidence", "evidence", "closing_evidence"],
          },
          requirementIds: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: { type: "string" },
          },
          evidenceFactIds: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: { type: "string" },
          },
        },
        required: [
          "targetBlockId",
          "purpose",
          "requirementIds",
          "evidenceFactIds",
        ],
        additionalProperties: false,
      },
    },
    gaps: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        properties: {
          requirementId: { type: "string" },
          code: { type: "string", enum: ["MISSING_EVIDENCE", "WEAK_EVIDENCE"] },
          detail: { type: "string", minLength: 1, maxLength: 500 },
        },
        required: ["requirementId", "code", "detail"],
        additionalProperties: false,
      },
    },
    explanation: { type: "string", minLength: 1, maxLength: 1000 },
  },
  required: ["schemaVersion", "paragraphs", "gaps", "explanation"],
  additionalProperties: false,
} satisfies Record<string, unknown>;

export const coverLetterParagraphSchema = resumeBulletSuggestionSchema.extend({
  schemaVersion: z.literal("ai-08.v1"),
});

export const coverLetterParagraphJsonSchema = {
  ...resumeBulletSuggestionJsonSchema,
  properties: {
    ...resumeBulletSuggestionJsonSchema.properties,
    schemaVersion: { type: "string", enum: ["ai-08.v1"] },
  },
} satisfies Record<string, unknown>;

export interface TailoringEvidenceInput {
  id: string;
  displayText: string;
  value: unknown;
}

export interface EvidenceRequirementSupport {
  evidenceFactId: string;
  requirementId: string;
  strength: "direct" | "combined";
}

function evidenceText(evidence: TailoringEvidenceInput): string {
  return `${evidence.displayText} ${JSON.stringify(evidence.value)}`;
}

function numericTokens(value: string): string[] {
  return value.match(/\b\d+(?:[.,]\d+)?%?\b/gu) ?? [];
}

export function validateResumeSectionPlan(
  value: z.infer<typeof resumeSectionPlanSchema>,
  allowedSectionIds: ReadonlySet<string>,
  allowedRequirementIds: ReadonlySet<string>,
): void {
  const included = new Set(value.includedSectionIds);
  if (
    included.size !== value.includedSectionIds.length ||
    new Set(value.orderedSectionIds).size !== value.orderedSectionIds.length ||
    value.orderedSectionIds.length !== value.includedSectionIds.length ||
    value.orderedSectionIds.some((id) => !included.has(id)) ||
    value.includedSectionIds.some((id) => !allowedSectionIds.has(id)) ||
    value.gaps.some((gap) => !allowedRequirementIds.has(gap.requirementId))
  )
    throw new Error(
      "Section plan contains an unknown or inconsistent identifier.",
    );
}

export function validateCoverLetterPlan(
  value: z.infer<typeof coverLetterPlanSchema>,
  input: {
    allowedBlockIds: ReadonlySet<string>;
    allowedRequirementIds: ReadonlySet<string>;
    evidence: ReadonlySet<string>;
    support: EvidenceRequirementSupport[];
  },
): void {
  const targets = new Set<string>();
  for (const paragraph of value.paragraphs) {
    if (
      targets.has(paragraph.targetBlockId) ||
      !input.allowedBlockIds.has(paragraph.targetBlockId) ||
      paragraph.requirementIds.some(
        (requirementId) => !input.allowedRequirementIds.has(requirementId),
      ) ||
      paragraph.evidenceFactIds.some((factId) => !input.evidence.has(factId)) ||
      paragraph.evidenceFactIds.some(
        (factId) =>
          !input.support.some(
            (item) =>
              item.evidenceFactId === factId &&
              paragraph.requirementIds.includes(item.requirementId),
          ),
      )
    )
      throw new Error(
        "Cover-letter plan contains an unknown or unsupported identifier.",
      );
    targets.add(paragraph.targetBlockId);
  }
  if (
    value.gaps.some(
      (gap) => !input.allowedRequirementIds.has(gap.requirementId),
    )
  )
    throw new Error("Cover-letter plan contains an unknown requirement gap.");
}

export function validateResumeBulletSuggestion(
  value: {
    targetBlockId: string;
    text: string;
    claims: Array<{
      start: number;
      end: number;
      evidenceFactIds: string[];
      relation: "direct" | "combines" | "paraphrases";
    }>;
    requirementIds: string[];
  },
  input: {
    targetBlockId: string;
    allowedRequirementIds: ReadonlySet<string>;
    evidence: ReadonlyMap<string, TailoringEvidenceInput>;
    support: EvidenceRequirementSupport[];
  },
): void {
  if (value.targetBlockId !== input.targetBlockId)
    throw new Error("Suggestion targeted a different block.");
  if (value.requirementIds.some((id) => !input.allowedRequirementIds.has(id)))
    throw new Error("Suggestion referenced an unknown requirement.");
  const coverage = Array.from({ length: value.text.length }, () => false);
  const sorted = [...value.claims].sort(
    (left, right) => left.start - right.start,
  );
  let previousEnd = 0;
  for (const claim of sorted) {
    if (claim.end > value.text.length || claim.end <= claim.start)
      throw new Error("Claim span is outside the proposed text.");
    if (claim.start < previousEnd) throw new Error("Claim spans overlap.");
    previousEnd = claim.end;
    const cited = claim.evidenceFactIds.map((id) => input.evidence.get(id));
    if (cited.some((item) => !item))
      throw new Error("Claim cited unknown or unselected evidence.");
    const supportsRequirement = claim.evidenceFactIds.every((factId) =>
      input.support.some(
        (item) =>
          item.evidenceFactId === factId &&
          value.requirementIds.includes(item.requirementId),
      ),
    );
    if (!supportsRequirement)
      throw new Error("Claim evidence is not an included strong match.");
    const claimText = value.text.slice(claim.start, claim.end);
    const combinedEvidence = cited.map((item) => evidenceText(item!)).join(" ");
    const evidenceTokens = new Set(lexicalTokens(combinedEvidence));
    const claimTokens = lexicalTokens(claimText);
    const overlap = claimTokens.filter((token) => evidenceTokens.has(token));
    if (claimTokens.length > 0 && overlap.length / claimTokens.length < 0.35)
      throw new Error("Claim is not sufficiently entailed by cited evidence.");
    if (
      numericTokens(claimText).some(
        (number) => !numericTokens(combinedEvidence).includes(number),
      )
    )
      throw new Error("Claim introduced an unsupported numeric value.");
    for (let index = claim.start; index < claim.end; index += 1)
      coverage[index] = true;
  }
  for (let index = 0; index < value.text.length; index += 1) {
    const character = value.text[index]!;
    if (!/\s|[.,;:()\-]/u.test(character) && !coverage[index])
      throw new Error(
        "Proposed factual text is not fully covered by claim spans.",
      );
  }
}

export function tailoringHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
