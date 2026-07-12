import { z } from "zod";

import { canonicalDocumentSchema } from "./document-schema";

export const draftConflictResponseSchema = z.object({
  code: z.literal("DRAFT_CONFLICT"),
  server: z.object({
    baseVersionId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    content: canonicalDocumentSchema,
    updatedAt: z.string().datetime(),
    source: z.enum(["draft", "current_version"]),
  }),
});

export type DraftConflictResponse = z.infer<typeof draftConflictResponseSchema>;
