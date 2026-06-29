// @vitest-environment node

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  detectSupportedMediaType,
  safeDisplayFilename,
  validateDocxArchive,
} from "@/modules/ingestion/file-validation";

async function docxWith(
  entryName: string,
  value: string | Buffer,
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", "<w:document/>");
  zip.file(entryName, value);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

describe("hostile upload rejection", () => {
  it("does not use client paths as storage names", () => {
    expect(safeDisplayFilename("C:\\fakepath\\resume.txt")).toBe("resume.txt");
    expect(() => safeDisplayFilename("../\u0000")).toThrow();
  });

  it("rejects extension/signature and declared media-type mismatches", async () => {
    await expect(
      detectSupportedMediaType({
        bytes: Buffer.from("MZ synthetic executable"),
        declaredMediaType: "text/plain",
        filename: "resume.txt",
      }),
    ).rejects.toMatchObject({ code: "SIGNATURE_MISMATCH" });
    await expect(
      detectSupportedMediaType({
        bytes: Buffer.from("plain"),
        declaredMediaType: "application/pdf",
        filename: "resume.txt",
      }),
    ).rejects.toMatchObject({ code: "DECLARED_TYPE_MISMATCH" });
  });

  it("rejects macros, embedded objects, and high-ratio DOCX entries", async () => {
    await expect(
      validateDocxArchive(await docxWith("word/vbaProject.bin", "macro")),
    ).rejects.toMatchObject({ code: "ACTIVE_DOCX_CONTENT" });
    await expect(
      validateDocxArchive(
        await docxWith("word/embeddings/object.bin", "object"),
      ),
    ).rejects.toMatchObject({ code: "ACTIVE_DOCX_CONTENT" });
    await expect(
      validateDocxArchive(
        await docxWith("word/large.xml", Buffer.alloc(2_000_000)),
        { maxRatio: 10 },
      ),
    ).rejects.toMatchObject({ code: "DOCX_RESOURCE_LIMIT" });
  });

  it("rejects an excessive extracted-text result", async () => {
    const { parseSourceBuffer } = await import("@/modules/ingestion/parsers");
    await expect(
      parseSourceBuffer(
        "text/plain",
        Buffer.from("x".repeat(100_001)),
        100_000,
      ),
    ).rejects.toMatchObject({ code: "EXTRACTED_TEXT_LIMIT" });
  });
});
