import { z } from "zod";

import {
  careerEntryTypeSchema,
  factProposalInputSchema,
} from "@/modules/career/domain";

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
