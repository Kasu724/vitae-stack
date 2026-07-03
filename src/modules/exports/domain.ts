import { z } from "zod";

import type { CanonicalDocument } from "@/modules/documents/document-schema";

export const exportFormatSchema = z.enum([
  "pdf",
  "docx",
  "markdown",
  "text",
  "json",
]);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const EXPORT_TEMPLATE_ID = "ats-safe-single-column@2" as const;
export const EXPORT_MAX_BYTES = 10 * 1024 * 1024;

export class UnsupportedExportClaimsError extends Error {
  public constructor(public readonly claimIds: string[]) {
    super("Final PDF and DOCX export requires current approved evidence.");
    this.name = "UnsupportedExportClaimsError";
  }
}

export class ExportValidationError extends Error {
  public constructor(message = "The export could not be validated safely.") {
    super(message);
    this.name = "ExportValidationError";
  }
}

export interface RenderedExport {
  bytes: Buffer;
  format: ExportFormat;
  classification: "final" | "draft";
  mediaType: string;
  extension: string;
  rendererVersion: string;
  warnings: string[];
  sourceText: string;
}

export function exportSourceText(document: CanonicalDocument): string {
  return document.sections
    .flatMap((section) => [
      section.heading ?? "",
      ...section.blocks.map((block) => block.text),
    ])
    .filter((value) => value.trim().length > 0)
    .join("\n");
}

export function normalizedExportTokens(value: string): string[] {
  return (
    value
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}+#.%@-]+/gu) ?? []
  );
}

export function orderedTokenCoverage(source: string, parsed: string): number {
  const expected = normalizedExportTokens(source);
  if (!expected.length) return 1;
  const actual = normalizedExportTokens(parsed);
  let cursor = 0;
  let matched = 0;
  for (const token of expected) {
    while (cursor < actual.length && actual[cursor] !== token) cursor += 1;
    if (cursor >= actual.length) break;
    matched += 1;
    cursor += 1;
  }
  return matched / expected.length;
}

export function safeExportFilename(title: string, extension: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^A-Za-z0-9 _.-]+/gu, "")
    .replace(/[. ]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 140);
  return `${base || "career-document"}.${extension}`;
}

export function sanitizeExportDocument(document: CanonicalDocument): {
  document: CanonicalDocument;
  warnings: string[];
} {
  let removedDirectionalControls = false;
  const clean = (value: string): string => {
    const result = value.replace(/[\u202A-\u202E\u2066-\u2069]/gu, "");
    if (result !== value) removedDirectionalControls = true;
    return result;
  };
  return {
    document: {
      ...document,
      sections: document.sections.map((section) => ({
        ...section,
        ...(section.heading ? { heading: clean(section.heading) } : {}),
        blocks: section.blocks.map((block) => ({
          ...block,
          text: clean(block.text),
        })),
      })),
    },
    warnings: removedDirectionalControls
      ? ["Directional formatting controls were removed from the export."]
      : [],
  };
}
