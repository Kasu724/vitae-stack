import path from "node:path";

import mammoth from "mammoth";

import type { SupportedMediaType } from "./file-validation";
import { UnsafeUploadError, validateDocxArchive } from "./file-validation";

export interface ParsedSource {
  text: string;
  metadata: {
    schemaVersion: 1;
    pageCount?: number | undefined;
    paragraphCount?: number | undefined;
  };
  warnings: string[];
  parserVersion: string;
}

const pdfStandardFontDataUrl = `${path.join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "standard_fonts",
)}/`;

function boundedText(text: string, maximum: number): string {
  const cleaned = text
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .replace(/[\u202A-\u202E\u2066-\u2069]/gu, "");
  if (cleaned.length > maximum)
    throw new UnsafeUploadError("EXTRACTED_TEXT_LIMIT");
  if (cleaned.trim() && cleaned.trim().split(/\s+/u).length > 100_000)
    throw new UnsafeUploadError("EXTRACTED_WORD_LIMIT");
  return cleaned;
}

function containsBidiControls(text: string): boolean {
  return /[\u202A-\u202E\u2066-\u2069]/u.test(text);
}

function decodeUtf8(buffer: Buffer, maximum: number): string {
  try {
    return boundedText(
      new TextDecoder("utf-8", { fatal: true }).decode(buffer),
      maximum,
    );
  } catch (error) {
    if (error instanceof UnsafeUploadError) throw error;
    throw new UnsafeUploadError("INVALID_UTF8");
  }
}

export async function parseSourceBuffer(
  mediaType: SupportedMediaType,
  buffer: Buffer,
  maximumTextCharacters = 500_000,
): Promise<ParsedSource> {
  if (mediaType === "application/pdf") {
    // PDF.js loads this adapter dynamically in Node. Importing it explicitly
    // keeps the native package and its platform binary in standalone builds.
    await import("@napi-rs/canvas");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableAutoFetch: true,
      disableFontFace: true,
      standardFontDataUrl: pdfStandardFontDataUrl,
      useWorkerFetch: false,
    });
    let document;
    try {
      document = await task.promise;
      if (document.numPages > 200)
        throw new UnsafeUploadError("PDF_PAGE_LIMIT");
      const pages: string[] = [];
      const warnings: string[] = [];
      for (
        let pageNumber = 1;
        pageNumber <= document.numPages;
        pageNumber += 1
      ) {
        const page = await document.getPage(pageNumber);
        if (page.view.some((dimension) => Math.abs(dimension) > 20_000))
          throw new UnsafeUploadError("PDF_DIMENSION_LIMIT");
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        if (!pageText.trim())
          warnings.push(
            `Page ${pageNumber} contains no extractable text; OCR is not available.`,
          );
        if (containsBidiControls(pageText))
          warnings.push(
            `Page ${pageNumber} contained directional control characters that were removed.`,
          );
        pages.push(pageText);
        if (
          pages.reduce((length, value) => length + value.length, 0) >
          maximumTextCharacters
        )
          throw new UnsafeUploadError("EXTRACTED_TEXT_LIMIT");
      }
      return {
        text: boundedText(pages.join("\n\n"), maximumTextCharacters),
        metadata: { schemaVersion: 1, pageCount: document.numPages },
        warnings,
        parserVersion: `pdfjs-dist@6.1.200`,
      };
    } catch (error) {
      if (error instanceof UnsafeUploadError) throw error;
      throw new UnsafeUploadError("PDF_PARSE_FAILED");
    } finally {
      await task.destroy();
    }
  }
  if (mediaType.includes("wordprocessingml")) {
    await validateDocxArchive(buffer);
    try {
      // extractRawText does not resolve relationships or emit active HTML;
      // Mammoth's external file access remains disabled by default.
      const result = await mammoth.extractRawText({ buffer });
      const text = boundedText(result.value, maximumTextCharacters);
      const warnings = result.messages.map((message) =>
        message.message.slice(0, 500),
      );
      if (containsBidiControls(result.value))
        warnings.push(
          "Directional control characters were removed from extracted text.",
        );
      return {
        text,
        metadata: {
          schemaVersion: 1,
          paragraphCount: text.split(/\n\s*\n/gu).filter(Boolean).length,
        },
        warnings,
        parserVersion: "mammoth@1.12.0",
      };
    } catch (error) {
      if (error instanceof UnsafeUploadError) throw error;
      throw new UnsafeUploadError("DOCX_PARSE_FAILED");
    }
  }
  const text = decodeUtf8(buffer, maximumTextCharacters);
  if (mediaType === "application/json") {
    try {
      const value = JSON.parse(text) as { schemaVersion?: unknown };
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        value.schemaVersion !== 1
      )
        throw new Error("Expected a version 1 project object.");
    } catch {
      throw new UnsafeUploadError("INVALID_JSON");
    }
  }
  return {
    text,
    metadata: {
      schemaVersion: 1,
      paragraphCount: text.split(/\n\s*\n/gu).filter(Boolean).length,
    },
    warnings: containsBidiControls(
      new TextDecoder("utf-8", { fatal: false }).decode(buffer),
    )
      ? ["Directional control characters were removed from extracted text."]
      : [],
    parserVersion:
      mediaType === "text/markdown"
        ? "builtin-markdown-text@1"
        : mediaType === "application/json"
          ? "builtin-json@1"
          : "builtin-text@1",
  };
}
