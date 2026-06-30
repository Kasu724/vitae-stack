import { createHash } from "node:crypto";

import { z } from "zod";

const bidiControls = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

export const jobMetadataInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  company: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value || null),
});

export const pastedJobInputSchema = jobMetadataInputSchema.extend({
  text: z.string().min(1).max(500_000),
});

export interface NormalizedJobText {
  text: string;
  hash: string;
  warnings: string[];
  wordCount: number;
}

export function normalizeJobText(raw: string): NormalizedJobText {
  const bounded = z.string().min(1).max(500_000).parse(raw);
  const warnings: string[] = [];
  let text = bounded.replace(/\0/gu, "");
  if (text.length !== bounded.length)
    warnings.push("Null characters were removed from the input.");
  const withoutBidi = text.replace(bidiControls, "");
  if (withoutBidi !== text) {
    text = withoutBidi;
    warnings.push("Bidirectional control characters were removed.");
  }
  text = text
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/gu, ""))
    .join("\n")
    .replace(/\n{4,}/gu, "\n\n\n")
    .trim();
  if (text.length < 3)
    throw new Error("The job description is empty after normalization.");
  const wordCount = text.split(/\s+/gu).filter(Boolean).length;
  if (wordCount > 100_000)
    throw new Error("The job description exceeds the 100,000-word limit.");
  if (wordCount < 50)
    warnings.push(
      "The job description is short; later analysis may be incomplete.",
    );
  return {
    text,
    hash: `sha256:${createHash("sha256").update(text).digest("hex")}`,
    warnings,
    wordCount,
  };
}
