import { createHash } from "node:crypto";

import { z } from "zod";

import {
  careerEntryTypeSchema,
  careerEntryTypes,
  factProposalInputSchema,
} from "@/modules/career/domain";

import type { EvidenceValue } from "@/infrastructure/database/value-types";

export const MAX_AI_EXTRACTION_SOURCE_CHARACTERS = 60_000;
export const AI_EXTRACTION_REVIEW_WARNING =
  "AI-generated classifications require review.";

const aiExtractionFactTypeSchema = z.enum([
  "statement",
  "skill",
  "accomplishment",
  "education",
  "custom",
]);

export const aiExtractionProposalSchema = z
  .object({
    entryKey: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/u),
    entryType: careerEntryTypeSchema,
    entryTitleStart: z.number().int().nonnegative(),
    entryTitleEnd: z.number().int().positive(),
    entryTitleText: z.string().min(1).max(200),
    factType: aiExtractionFactTypeSchema,
    sourceStart: z.number().int().nonnegative(),
    sourceEnd: z.number().int().positive(),
    sourceText: z.string().min(1).max(5_000),
  })
  .strict();

export type AiExtractionProposal = z.infer<typeof aiExtractionProposalSchema>;

export const aiExtractionOutputSchema = z
  .object({
    schemaVersion: z.literal("ai-01.v1"),
    proposals: z.array(aiExtractionProposalSchema).max(100),
    warnings: z.array(z.string().min(1).max(300)).max(20),
  })
  .strict();

export type AiExtractionOutput = z.infer<typeof aiExtractionOutputSchema>;

export const aiExtractionMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    taskVersion: z.literal("ai-01.v1"),
    warnings: z.array(z.literal(AI_EXTRACTION_REVIEW_WARNING)).max(1),
    inputHash: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    outputHash: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    providerConfigurationId: z.string().uuid(),
    model: z.string().trim().min(1).max(200),
    attempts: z.number().int().min(1).max(3),
  })
  .strict();

export type AiExtractionMetadata = z.infer<typeof aiExtractionMetadataSchema>;

export const aiExtractionJsonSchema = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["ai-01.v1"] },
    proposals: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        properties: {
          entryKey: {
            type: "string",
            pattern: "^[A-Za-z0-9_-]{1,64}$",
          },
          entryType: { type: "string", enum: careerEntryTypes },
          entryTitleStart: { type: "integer", minimum: 0 },
          entryTitleEnd: { type: "integer", minimum: 1 },
          entryTitleText: { type: "string", minLength: 1, maxLength: 200 },
          factType: {
            type: "string",
            enum: aiExtractionFactTypeSchema.options,
          },
          sourceStart: { type: "integer", minimum: 0 },
          sourceEnd: { type: "integer", minimum: 1 },
          sourceText: { type: "string", minLength: 1, maxLength: 5000 },
        },
        required: [
          "entryKey",
          "entryType",
          "entryTitleStart",
          "entryTitleEnd",
          "entryTitleText",
          "factType",
          "sourceStart",
          "sourceEnd",
          "sourceText",
        ],
        additionalProperties: false,
      },
    },
    warnings: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 1, maxLength: 300 },
    },
  },
  required: ["schemaVersion", "proposals", "warnings"],
  additionalProperties: false,
} satisfies Record<string, unknown>;

function validateExactSourceSpan(
  source: string,
  start: number,
  end: number,
  text: string,
): void {
  if (
    end <= start ||
    end > source.length ||
    source.slice(start, end) !== text ||
    text.trim() !== text ||
    /[\r\n]/u.test(text)
  )
    throw new Error("Invalid AI extraction source span.");
}

export function validateExtractionSourceSpans(
  source: string,
  proposals: AiExtractionProposal[],
): void {
  const entries = new Map<string, string>();
  const facts = new Set<string>();
  for (const proposal of proposals) {
    validateExactSourceSpan(
      source,
      proposal.entryTitleStart,
      proposal.entryTitleEnd,
      proposal.entryTitleText,
    );
    validateExactSourceSpan(
      source,
      proposal.sourceStart,
      proposal.sourceEnd,
      proposal.sourceText,
    );
    if (proposal.factType === "skill" && proposal.sourceText.length > 200)
      throw new Error("AI extraction skill exceeds the supported length.");
    const entryIdentity = JSON.stringify([
      proposal.entryType,
      proposal.entryTitleStart,
      proposal.entryTitleEnd,
      proposal.entryTitleText,
    ]);
    const previousEntry = entries.get(proposal.entryKey);
    if (previousEntry && previousEntry !== entryIdentity)
      throw new Error("AI extraction entry grouping is inconsistent.");
    entries.set(proposal.entryKey, entryIdentity);
    const factIdentity = `${proposal.entryKey}:${proposal.sourceStart}:${proposal.sourceEnd}:${proposal.factType}`;
    if (facts.has(factIdentity))
      throw new Error("AI extraction contains a duplicate proposal.");
    facts.add(factIdentity);
  }
}

export function aiProposalEvidenceValue(
  proposal: AiExtractionProposal,
): EvidenceValue {
  return proposal.factType === "skill"
    ? { kind: "skill", name: proposal.sourceText }
    : { kind: "text", text: proposal.sourceText };
}

export function hashExtractionValue(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export const extractionProposalEditSchema = z.object({
  entryType: careerEntryTypeSchema,
  entryTitle: z.string().trim().min(1).max(200),
  fact: factProposalInputSchema.omit({ sourceLocator: true }),
  targetCareerEntryId: z.string().uuid().nullable().optional(),
});

export type ExtractionProposalEdit = z.infer<
  typeof extractionProposalEditSchema
>;

export function deterministicLineCandidates(
  text: string,
  maximum = 100,
): Array<{ line: number; text: string }> {
  return text
    .split(/\n/gu)
    .map((value, index) => ({
      line: index + 1,
      text: value.replace(/^\s*(?:[-*•]|\d+[.)])\s*/u, "").trim(),
    }))
    .filter(
      (candidate) =>
        candidate.text.length >= 3 && candidate.text.length <= 5000,
    )
    .slice(0, maximum);
}

export function sourceEntryTitle(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/u, "").trim();
  return (withoutExtension || "Imported career evidence").slice(0, 200);
}
