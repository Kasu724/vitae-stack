// @vitest-environment node

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  detectSupportedMediaType,
  safeDisplayFilename,
  validateDocxArchive,
} from "@/modules/ingestion/file-validation";
import { readBoundedMultipartUpload } from "@/modules/ingestion/multipart-upload";
import { isTrustedRequestOrigin } from "@/modules/auth/auth-request-handler";

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
    await expect(
      detectSupportedMediaType({
        bytes: Buffer.from([0x61, 0, 0x62]),
        declaredMediaType: "text/plain",
        filename: "resume.txt",
      }),
    ).rejects.toMatchObject({ code: "TEXT_BINARY_CONTENT" });
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
    await expect(
      validateDocxArchive(
        await docxWith(
          "word/_rels/document.xml.rels",
          '<Relationships><Relationship TargetMode="External" Target="file:///etc/passwd"/></Relationships>',
        ),
      ),
    ).rejects.toMatchObject({ code: "EXTERNAL_DOCX_RELATIONSHIP" });
    await expect(
      validateDocxArchive(
        await docxWith(
          "word/settings.xml",
          '<!DOCTYPE x [<!ENTITY attack SYSTEM "file:///etc/passwd">]><x/>',
        ),
      ),
    ).rejects.toMatchObject({ code: "UNSAFE_DOCX_XML" });
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
  }, 15_000);

  it("enforces multipart file limits while streaming", async () => {
    const form = new FormData();
    form.set("purpose", "resume");
    form.set(
      "file",
      new File(["x".repeat(101)], "large.txt", { type: "text/plain" }),
    );
    const request = new Request("http://127.0.0.1:3000/api/sources", {
      method: "POST",
      body: form,
    });
    await expect(
      readBoundedMultipartUpload(request, 100),
    ).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
  });

  it("requires an exact origin or browser-verified same-origin fallback", () => {
    expect(
      isTrustedRequestOrigin(
        new Request("http://127.0.0.1:3000/api/sources", {
          headers: { origin: "http://127.0.0.1:3000" },
        }),
        "http://127.0.0.1:3000",
      ),
    ).toBe(true);
    expect(
      isTrustedRequestOrigin(
        new Request("http://127.0.0.1:3000/api/sources", {
          headers: { origin: "https://evil.invalid" },
        }),
        "http://127.0.0.1:3000",
      ),
    ).toBe(false);
    expect(
      isTrustedRequestOrigin(
        new Request("http://127.0.0.1:3000/api/sources", {
          headers: {
            host: "127.0.0.1:3000",
            origin: "null",
            "sec-fetch-site": "same-origin",
          },
        }),
        "http://127.0.0.1:3000",
      ),
    ).toBe(true);
    expect(
      isTrustedRequestOrigin(
        new Request("http://127.0.0.1:3000/api/sources", {
          headers: {
            host: "127.0.0.1:3000",
            origin: "null",
            "sec-fetch-site": "cross-site",
          },
        }),
        "http://127.0.0.1:3000",
      ),
    ).toBe(false);
    expect(
      isTrustedRequestOrigin(
        new Request("http://evil.invalid/api/sources", {
          headers: {
            host: "evil.invalid",
            origin: "null",
            "sec-fetch-site": "same-origin",
          },
        }),
        "http://127.0.0.1:3000",
      ),
    ).toBe(false);
  });
});
