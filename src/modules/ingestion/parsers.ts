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

function boundedText(text: string, maximum: number): string {
  const cleaned = text
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "");
  if (cleaned.length > maximum)
    throw new UnsafeUploadError("EXTRACTED_TEXT_LIMIT");
  return cleaned;
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
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableAutoFetch: true,
      disableFontFace: true,
      useWorkerFetch: false,
    });
    let document;
    try {
      document = await task.promise;
      if (document.numPages > 200)
        throw new UnsafeUploadError("PDF_PAGE_LIMIT");
      const pages: string[] = [];
      for (
        let pageNumber = 1;
        pageNumber <= document.numPages;
        pageNumber += 1
      ) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
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
        warnings: [],
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
      return {
        text,
        metadata: {
          schemaVersion: 1,
          paragraphCount: text.split(/\n\s*\n/gu).filter(Boolean).length,
        },
        warnings: result.messages.map((message) =>
          message.message.slice(0, 500),
        ),
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
      const value = JSON.parse(text) as unknown;
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error("Expected an object.");
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
    warnings: [],
    parserVersion:
      mediaType === "text/markdown"
        ? "builtin-markdown-text@1"
        : mediaType === "application/json"
          ? "builtin-json@1"
          : "builtin-text@1",
  };
}
