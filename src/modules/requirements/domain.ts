import { createHash } from "node:crypto";

import { z } from "zod";

export const requirementCategorySchema = z.enum([
  "required_qualification",
  "preferred_qualification",
  "responsibility",
  "keyword",
  "seniority",
  "ambiguity",
]);
export const requirementPrioritySchema = z.enum([
  "required",
  "preferred",
  "informational",
]);
export const requirementDecisionSchema = z.enum([
  "proposed",
  "accepted",
  "rejected",
]);

export const requirementProposalSchema = z
  .object({
    category: requirementCategorySchema,
    priority: requirementPrioritySchema,
    requirementText: z.string().trim().min(1).max(2_000),
    sourceStart: z.number().int().nonnegative().nullable(),
    sourceEnd: z.number().int().positive().nullable(),
    sourceText: z.string().min(1).max(4_000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const allNull =
      value.sourceStart === null &&
      value.sourceEnd === null &&
      value.sourceText === null;
    const allPresent =
      value.sourceStart !== null &&
      value.sourceEnd !== null &&
      value.sourceText !== null &&
      value.sourceEnd > value.sourceStart;
    if (!allNull && !allPresent)
      context.addIssue({
        code: "custom",
        path: ["sourceStart"],
        message: "Source locator must be complete.",
      });
  });
export type RequirementProposal = z.infer<typeof requirementProposalSchema>;

export const aiRequirementOutputSchema = z
  .object({
    schemaVersion: z.literal("ai-02.v1"),
    requirements: z.array(requirementProposalSchema).max(200),
    warnings: z.array(z.string().trim().min(1).max(300)).max(20),
  })
  .strict();

export const aiRequirementJsonSchema = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["ai-02.v1"] },
    requirements: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: requirementCategorySchema.options,
          },
          priority: {
            type: "string",
            enum: requirementPrioritySchema.options,
          },
          requirementText: { type: "string", minLength: 1, maxLength: 2000 },
          sourceStart: { type: ["integer", "null"], minimum: 0 },
          sourceEnd: { type: ["integer", "null"], minimum: 1 },
          sourceText: {
            type: ["string", "null"],
            minLength: 1,
            maxLength: 4000,
          },
        },
        required: [
          "category",
          "priority",
          "requirementText",
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
  required: ["schemaVersion", "requirements", "warnings"],
  additionalProperties: false,
} satisfies Record<string, unknown>;

export function validateRequirementSourceSpans(
  snapshot: string,
  proposals: RequirementProposal[],
): void {
  for (const proposal of proposals) {
    if (proposal.sourceStart === null) continue;
    if (
      proposal.sourceEnd! > snapshot.length ||
      snapshot.slice(proposal.sourceStart, proposal.sourceEnd!) !==
        proposal.sourceText
    )
      throw new Error("Invalid requirement source span.");
  }
}

function classify(
  line: string,
  heading: string,
): Pick<RequirementProposal, "category" | "priority"> {
  const context = `${heading} ${line}`.toLowerCase();
  if (/prefer|nice to have|bonus/u.test(context))
    return { category: "preferred_qualification", priority: "preferred" };
  if (/responsibil|what you.ll do|duties|you will/u.test(context))
    return { category: "responsibility", priority: "required" };
  if (/senior|years?\b.{0,40}\bexperience|level/u.test(context))
    return { category: "seniority", priority: "required" };
  if (/keyword|technolog|skills?/u.test(heading.toLowerCase()))
    return { category: "keyword", priority: "informational" };
  if (/or equivalent|unclear|ambiguous/u.test(context))
    return { category: "ambiguity", priority: "informational" };
  return { category: "required_qualification", priority: "required" };
}

export function extractDeterministicRequirements(
  snapshot: string,
): RequirementProposal[] {
  const proposals: RequirementProposal[] = [];
  let offset = 0;
  let heading = "";
  for (const rawLine of snapshot.split("\n")) {
    const leading = rawLine.length - rawLine.trimStart().length;
    const sourceText = rawLine.trim();
    const sourceStart = offset + leading;
    const sourceEnd = sourceStart + sourceText.length;
    offset += rawLine.length + 1;
    if (!sourceText) continue;
    const requirementText = sourceText.replace(/^[-*•]\s*/u, "").trim();
    const lower = requirementText.toLowerCase().replace(/:$/u, "");
    const looksLikeHeading =
      requirementText.endsWith(":") ||
      /^(requirements|qualifications|required qualifications|preferred qualifications|responsibilities|duties|what you.ll do|skills|technologies|about you)$/u.test(
        lower,
      );
    if (looksLikeHeading) {
      heading = requirementText;
      continue;
    }
    if (proposals.length >= 200) break;
    proposals.push({
      ...classify(requirementText, heading),
      requirementText,
      sourceStart,
      sourceEnd,
      sourceText,
    });
  }
  return proposals;
}

export function hashRequirementValue(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
