import { z } from "zod";

export const documentKindSchema = z.enum(["resume", "cover_letter"]);
export type DocumentKind = z.infer<typeof documentKindSchema>;

const blockTypeSchema = z.enum(["heading", "contact", "paragraph", "bullet"]);
const resumeSectionTypeSchema = z.enum([
  "contact",
  "summary",
  "experience",
  "education",
  "skills",
  "project",
  "custom",
]);
const letterSectionTypeSchema = z.enum([
  "header",
  "salutation",
  "body",
  "closing",
]);

export const documentBlockSchema = z.object({
  id: z.string().uuid(),
  type: blockTypeSchema,
  text: z
    .string()
    .max(20_000)
    .refine(
      (value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value),
      "Text contains unsupported control characters.",
    ),
});

export const documentSectionSchema = z.object({
  id: z.string().uuid(),
  type: z.union([resumeSectionTypeSchema, letterSectionTypeSchema]),
  heading: z.string().trim().max(200).optional(),
  blocks: z.array(documentBlockSchema).max(200),
});

export const canonicalDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: documentKindSchema,
    sections: z.array(documentSectionSchema).min(1).max(30),
  })
  .superRefine((document, context) => {
    const identifiers = new Set<string>();
    for (const [sectionIndex, section] of document.sections.entries()) {
      if (identifiers.has(section.id)) {
        context.addIssue({
          code: "custom",
          message: "Section and block IDs must be unique.",
          path: ["sections", sectionIndex, "id"],
        });
      }
      identifiers.add(section.id);
      const allowed =
        document.kind === "resume"
          ? resumeSectionTypeSchema.safeParse(section.type).success
          : letterSectionTypeSchema.safeParse(section.type).success;
      if (!allowed) {
        context.addIssue({
          code: "custom",
          message: `Section type ${section.type} is not allowed in a ${document.kind}.`,
          path: ["sections", sectionIndex, "type"],
        });
      }
      for (const [blockIndex, block] of section.blocks.entries()) {
        if (identifiers.has(block.id)) {
          context.addIssue({
            code: "custom",
            message: "Section and block IDs must be unique.",
            path: ["sections", sectionIndex, "blocks", blockIndex, "id"],
          });
        }
        identifiers.add(block.id);
      }
    }
  });

export type CanonicalDocument = z.infer<typeof canonicalDocumentSchema>;

export function createInitialDocument(kind: DocumentKind): CanonicalDocument {
  const section = (
    type: CanonicalDocument["sections"][number]["type"],
    heading: string | undefined,
    blockType: "contact" | "paragraph" | "bullet" = "paragraph",
  ) => ({
    id: crypto.randomUUID(),
    type,
    ...(heading ? { heading } : {}),
    blocks: [{ id: crypto.randomUUID(), type: blockType, text: "" }],
  });
  return kind === "resume"
    ? {
        schemaVersion: 1,
        kind,
        sections: [
          section("contact", "Contact", "contact"),
          section("summary", "Summary"),
          section("experience", "Experience", "bullet"),
          section("education", "Education", "bullet"),
          section("skills", "Skills", "bullet"),
        ],
      }
    : {
        schemaVersion: 1,
        kind,
        sections: [
          section("header", "Header", "contact"),
          section("salutation", undefined),
          section("body", undefined),
          section("closing", undefined),
        ],
      };
}

export function plainTextPaste(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "");
}

export interface DocumentDiff {
  addedSections: string[];
  removedSections: string[];
  changedSections: string[];
  addedBlocks: string[];
  removedBlocks: string[];
  changedBlocks: string[];
  addedClaims: string[];
  removedClaims: string[];
  changedClaims: string[];
  provenanceChanges: string[];
}

export function compareDocumentContent(
  before: CanonicalDocument,
  after: CanonicalDocument,
): DocumentDiff {
  const beforeSections = new Map(
    before.sections.map((section) => [section.id, section]),
  );
  const afterSections = new Map(
    after.sections.map((section) => [section.id, section]),
  );
  const beforeBlocks = new Map(
    before.sections.flatMap((section) =>
      section.blocks.map((block) => [block.id, block] as const),
    ),
  );
  const afterBlocks = new Map(
    after.sections.flatMap((section) =>
      section.blocks.map((block) => [block.id, block] as const),
    ),
  );
  return {
    addedSections: [...afterSections.keys()].filter(
      (id) => !beforeSections.has(id),
    ),
    removedSections: [...beforeSections.keys()].filter(
      (id) => !afterSections.has(id),
    ),
    changedSections: [...afterSections]
      .filter(([id, section]) => {
        const old = beforeSections.get(id);
        return (
          old !== undefined &&
          (old.type !== section.type || old.heading !== section.heading)
        );
      })
      .map(([id]) => id),
    addedBlocks: [...afterBlocks.keys()].filter((id) => !beforeBlocks.has(id)),
    removedBlocks: [...beforeBlocks.keys()].filter(
      (id) => !afterBlocks.has(id),
    ),
    changedBlocks: [...afterBlocks]
      .filter(([id, block]) => {
        const old = beforeBlocks.get(id);
        return (
          old !== undefined &&
          (old.type !== block.type || old.text !== block.text)
        );
      })
      .map(([id]) => id),
    addedClaims: [],
    removedClaims: [],
    changedClaims: [],
    provenanceChanges: [],
  };
}
