import { z } from "zod";

import { contentHash } from "@/modules/documents/hash";

export const ATS_AI_TASK_VERSION = "ai-11.v1";
export const MAX_ATS_AI_INPUT_CHARACTERS = 120_000;

export const atsAiCategoryKeys = [
  "parsing",
  "formatting",
  "readability",
  "content",
  "impact",
  "job_alignment",
] as const;

export type AtsAiCategoryKey = (typeof atsAiCategoryKeys)[number];

const scoreSchema = z.number().int().min(0).max(100);

const categorySchema = z
  .object({
    key: z.enum(atsAiCategoryKeys),
    label: z.string().trim().min(1).max(100),
    score: scoreSchema,
    weight: z.number().int().min(1).max(100),
    rationale: z.string().trim().min(1).max(2_000),
  })
  .strict();

const findingSchema = z
  .object({
    category: z.enum(atsAiCategoryKeys),
    severity: z.enum(["info", "low", "medium", "high"]),
    location: z.string().trim().min(1).max(300),
    message: z.string().trim().min(1).max(2_000),
    remediation: z.string().trim().min(1).max(2_000),
  })
  .strict();

const baseOutputSchema = z
  .object({
    schemaVersion: z.literal(ATS_AI_TASK_VERSION),
    summary: z.string().trim().min(1).max(4_000),
    overallScore: scoreSchema,
    overallRationale: z.string().trim().min(1).max(2_000),
    categories: z.array(categorySchema).min(5).max(6),
    findings: z.array(findingSchema).max(30),
  })
  .strict();

export type AtsAiOutput = z.infer<typeof baseOutputSchema>;

const coreCategories = [
  "parsing",
  "formatting",
  "readability",
  "content",
  "impact",
] as const satisfies ReadonlyArray<AtsAiCategoryKey>;

export function atsAiOutputSchemaForContext(hasJob: boolean) {
  const expected = new Set<AtsAiCategoryKey>([
    ...coreCategories,
    ...(hasJob ? (["job_alignment"] as const) : []),
  ]);
  return baseOutputSchema.superRefine((value, context) => {
    const keys = value.categories.map((category) => category.key);
    if (
      keys.length !== expected.size ||
      new Set(keys).size !== keys.length ||
      keys.some((key) => !expected.has(key))
    )
      context.addIssue({
        code: "custom",
        path: ["categories"],
        message:
          "The analysis must contain exactly the categories for this context.",
      });
    if (
      value.categories.reduce((sum, category) => sum + category.weight, 0) !==
      100
    )
      context.addIssue({
        code: "custom",
        path: ["categories"],
        message: "Category weights must total 100.",
      });
    const categorySet = new Set(keys);
    for (const [index, finding] of value.findings.entries())
      if (!categorySet.has(finding.category))
        context.addIssue({
          code: "custom",
          path: ["findings", index, "category"],
          message: "Finding category is not part of this analysis.",
        });
  });
}

export const atsAiJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "summary",
    "overallScore",
    "overallRationale",
    "categories",
    "findings",
  ],
  properties: {
    schemaVersion: { const: ATS_AI_TASK_VERSION },
    summary: { type: "string", minLength: 1, maxLength: 4_000 },
    overallScore: { type: "integer", minimum: 0, maximum: 100 },
    overallRationale: { type: "string", minLength: 1, maxLength: 2_000 },
    categories: {
      type: "array",
      minItems: 5,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "score", "weight", "rationale"],
        properties: {
          key: { type: "string", enum: atsAiCategoryKeys },
          label: { type: "string", minLength: 1, maxLength: 100 },
          score: { type: "integer", minimum: 0, maximum: 100 },
          weight: { type: "integer", minimum: 1, maximum: 100 },
          rationale: { type: "string", minLength: 1, maxLength: 2_000 },
        },
      },
    },
    findings: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "category",
          "severity",
          "location",
          "message",
          "remediation",
        ],
        properties: {
          category: { type: "string", enum: atsAiCategoryKeys },
          severity: {
            type: "string",
            enum: ["info", "low", "medium", "high"],
          },
          location: { type: "string", minLength: 1, maxLength: 300 },
          message: { type: "string", minLength: 1, maxLength: 2_000 },
          remediation: { type: "string", minLength: 1, maxLength: 2_000 },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

export function hashAtsAiValue(value: unknown): string {
  return contentHash(value);
}
