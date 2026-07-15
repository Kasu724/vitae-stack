import { z } from "zod";

export const careerEntryTypes = [
  "work",
  "internship",
  "project",
  "research",
  "education",
  "certification",
  "award",
  "leadership",
  "extracurricular",
  "volunteering",
  "coursework",
  "publication",
  "accomplishment",
  "metric",
  "skill",
  "custom",
] as const;

export const careerEntryTypeSchema = z.enum(careerEntryTypes);
export type CareerEntryType = z.infer<typeof careerEntryTypeSchema>;

export const careerSections = [
  "experience",
  "projects",
  "education",
  "skills",
  "research",
  "leadership",
  "certifications",
  "awards",
  "additional",
] as const;

export type CareerSection = (typeof careerSections)[number];

export const careerSectionLabels: Record<CareerSection, string> = {
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
  research: "Research and publications",
  leadership: "Leadership and service",
  certifications: "Certifications",
  awards: "Awards and accomplishments",
  additional: "Additional information",
};

const entryTypeSections: Record<CareerEntryType, CareerSection> = {
  work: "experience",
  internship: "experience",
  project: "projects",
  education: "education",
  coursework: "education",
  skill: "skills",
  research: "research",
  publication: "research",
  leadership: "leadership",
  extracurricular: "leadership",
  volunteering: "leadership",
  certification: "certifications",
  award: "awards",
  accomplishment: "awards",
  metric: "additional",
  custom: "additional",
};

export function careerSectionForEntryType(
  type: CareerEntryType | string,
): CareerSection {
  const parsed = careerEntryTypeSchema.safeParse(type);
  return parsed.success ? entryTypeSections[parsed.data] : "additional";
}

const attributeText = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .transform((value) => value || null);

const attributeList = z
  .array(z.string().trim().min(1).max(500))
  .max(50)
  .default([])
  .transform((values) => [...new Set(values)]);

export const careerEntryAttributesSchema = z
  .object({
    major: attributeText,
    minor: attributeText,
    relevantCourses: attributeList,
    awards: attributeList,
    technologies: attributeList,
  })
  .strict();

export type CareerEntryAttributes = z.infer<typeof careerEntryAttributesSchema>;

export const partialDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/, {
    message: "Use YYYY, YYYY-MM, or YYYY-MM-DD.",
  })
  .refine((value) => {
    if (value.length !== 10) return true;
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value)
    );
  }, "Enter a valid calendar date.");

export interface NormalizedPartialDate {
  date: string;
  precision: "day" | "month" | "year";
}

export function normalizePartialDate(
  value: string | null | undefined,
): NormalizedPartialDate | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  const valid = partialDateSchema.parse(candidate);
  if (valid.length === 4) return { date: `${valid}-01-01`, precision: "year" };
  if (valid.length === 7) return { date: `${valid}-01`, precision: "month" };
  return { date: valid, precision: "day" };
}

const optionalText = z
  .string()
  .trim()
  .max(2_000)
  .nullable()
  .optional()
  .transform((value) => value || null);

export const careerEntryInputSchema = z
  .object({
    type: careerEntryTypeSchema,
    title: z.string().trim().min(1).max(200),
    organization: optionalText,
    location: optionalText,
    description: z
      .string()
      .trim()
      .max(20_000)
      .nullable()
      .optional()
      .transform((value) => value || null),
    startDate: z.union([partialDateSchema, z.literal("")]).optional(),
    endDate: z.union([partialDateSchema, z.literal("")]).optional(),
    isCurrent: z.boolean().default(false),
    tags: z
      .array(z.string().trim().min(1).max(50))
      .max(30)
      .default([])
      .transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))]),
    attributes: careerEntryAttributesSchema.default({
      major: null,
      minor: null,
      relevantCourses: [],
      awards: [],
      technologies: [],
    }),
  })
  .superRefine((value, context) => {
    if (value.isCurrent && value.endDate) {
      context.addIssue({
        code: "custom",
        message: "A current entry cannot have an end date.",
        path: ["endDate"],
      });
    }
    const parsedStart = partialDateSchema.safeParse(value.startDate);
    const parsedEnd = partialDateSchema.safeParse(value.endDate);
    const start = parsedStart.success
      ? normalizePartialDate(parsedStart.data)
      : null;
    const end = parsedEnd.success ? normalizePartialDate(parsedEnd.data) : null;
    if (start && end && end.date < start.date) {
      context.addIssue({
        code: "custom",
        message: "The end date cannot be earlier than the start date.",
        path: ["endDate"],
      });
    }
  });

export type CareerEntryInput = z.input<typeof careerEntryInputSchema>;

const sourceLocatorSchema = z
  .object({
    kind: z.enum(["manual", "document"]),
    label: z.string().trim().min(1).max(500),
    page: z.number().int().positive().optional(),
    section: z.string().trim().max(500).optional(),
    sourceDocumentId: z.string().uuid().optional(),
    startOffset: z.number().int().nonnegative().optional(),
    endOffset: z.number().int().positive().optional(),
  })
  .superRefine((value, context) => {
    const hasStart = value.startOffset !== undefined;
    const hasEnd = value.endOffset !== undefined;
    if (
      hasStart !== hasEnd ||
      (hasStart && value.endOffset! <= value.startOffset!)
    )
      context.addIssue({
        code: "custom",
        path: ["startOffset"],
        message: "Source offsets must form a complete increasing range.",
      });
  });

export const evidenceValueSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    text: z.string().trim().min(1).max(20_000),
  }),
  z.object({
    kind: z.literal("metric"),
    value: z.number().finite(),
    unit: z.string().trim().min(1).max(100),
    context: z.string().trim().min(1).max(1_000),
  }),
  z.object({
    kind: z.literal("date"),
    value: partialDateSchema,
    precision: z.enum(["day", "month", "year"]),
  }),
  z.object({
    kind: z.literal("skill"),
    name: z.string().trim().min(1).max(200),
  }),
]);

export const factProposalInputSchema = z.object({
  type: z.enum([
    "statement",
    "metric",
    "date",
    "skill",
    "accomplishment",
    "education",
    "custom",
  ]),
  value: evidenceValueSchema,
  displayText: z.string().trim().min(1).max(20_000),
  sourceLocator: sourceLocatorSchema,
});

export type FactProposalInput = z.infer<typeof factProposalInputSchema>;

export function parseTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
