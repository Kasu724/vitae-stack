import path from "node:path";

import { fileTypeFromBuffer } from "file-type";
import yauzl, { type Entry, type ZipFile } from "yauzl";

export type SupportedMediaType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "text/markdown"
  | "text/plain"
  | "application/json";

const extensionMediaTypes: Record<string, SupportedMediaType> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
};

export class UnsafeUploadError extends Error {
  public constructor(public readonly code: string) {
    super("The uploaded file was rejected by the safety policy.");
    this.name = "UnsafeUploadError";
  }
}

export function safeDisplayFilename(input: string): string {
  const name = path
    .basename(input.replaceAll("\\", "/"))
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim();
  if (!name || name === "." || name === ".." || name.length > 200)
    throw new UnsafeUploadError("INVALID_FILENAME");
  return name;
}

function openZip(buffer: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
      (error, zipFile) =>
        error || !zipFile
          ? reject(error ?? new Error("Invalid ZIP."))
          : resolve(zipFile),
    );
  });
}

export async function validateDocxArchive(
  buffer: Buffer,
  limits: {
    maxEntries?: number;
    maxUncompressedBytes?: number;
    maxRatio?: number;
  } = {},
): Promise<void> {
  const maxEntries = limits.maxEntries ?? 100;
  const maxUncompressedBytes = limits.maxUncompressedBytes ?? 20 * 1024 * 1024;
  const maxRatio = limits.maxRatio ?? 20;
  const zip = await openZip(buffer).catch(() => {
    throw new UnsafeUploadError("INVALID_DOCX_ARCHIVE");
  });
  await new Promise<void>((resolve, reject) => {
    let count = 0;
    let total = 0;
    let contentTypes = false;
    let documentXml = false;
    let settled = false;
    const fail = (code: string) => {
      if (settled) return;
      settled = true;
      zip.close();
      reject(new UnsafeUploadError(code));
    };
    zip.on("error", () => fail("INVALID_DOCX_ARCHIVE"));
    zip.on("entry", (entry: Entry) => {
      count += 1;
      total += entry.uncompressedSize;
      const normalized = entry.fileName.replaceAll("\\", "/");
      if (
        count > maxEntries ||
        total > maxUncompressedBytes ||
        entry.uncompressedSize > maxUncompressedBytes ||
        (entry.compressedSize > 0 &&
          entry.uncompressedSize / entry.compressedSize > maxRatio)
      )
        return fail("DOCX_RESOURCE_LIMIT");
      if (
        normalized.startsWith("/") ||
        normalized.split("/").includes("..") ||
        normalized.split("/").length > 10 ||
        ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000 ||
        (entry.generalPurposeBitFlag & 1) !== 0
      )
        return fail("UNSAFE_DOCX_ENTRY");
      const lower = normalized.toLowerCase();
      if (
        lower.endsWith("vbaproject.bin") ||
        lower.includes("/embeddings/") ||
        /\.(?:zip|docx|docm)$/u.test(lower)
      )
        return fail("ACTIVE_DOCX_CONTENT");
      if (normalized === "[Content_Types].xml") contentTypes = true;
      if (normalized === "word/document.xml") documentXml = true;
      if (lower.endsWith(".xml") || lower.endsWith(".rels")) {
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return fail("INVALID_DOCX_ARCHIVE");
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("error", () => fail("INVALID_DOCX_ARCHIVE"));
          stream.on("end", () => {
            const xml = Buffer.concat(chunks).toString("utf8");
            if (/<!DOCTYPE|<!ENTITY/iu.test(xml))
              return fail("UNSAFE_DOCX_XML");
            if (
              lower.endsWith(".rels") &&
              /TargetMode\s*=\s*["']External["']/iu.test(xml)
            )
              return fail("EXTERNAL_DOCX_RELATIONSHIP");
            zip.readEntry();
          });
        });
      } else zip.readEntry();
    });
    zip.on("end", () => {
      if (settled) return;
      settled = true;
      zip.close();
      if (!contentTypes || !documentXml)
        reject(new UnsafeUploadError("INVALID_DOCX_STRUCTURE"));
      else resolve();
    });
    zip.readEntry();
  });
}

export async function detectSupportedMediaType(input: {
  bytes: Buffer;
  declaredMediaType: string;
  filename: string;
}): Promise<SupportedMediaType> {
  if (input.bytes.length === 0) throw new UnsafeUploadError("EMPTY_FILE");
  const name = safeDisplayFilename(input.filename);
  const extensionType = extensionMediaTypes[path.extname(name).toLowerCase()];
  if (!extensionType) throw new UnsafeUploadError("UNSUPPORTED_EXTENSION");
  const signature = await fileTypeFromBuffer(input.bytes);
  let detected: SupportedMediaType;
  if (signature?.mime === "application/pdf") detected = "application/pdf";
  else if (
    signature?.mime === "application/zip" &&
    extensionType.includes("wordprocessingml")
  ) {
    await validateDocxArchive(input.bytes);
    detected =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else if (
    !signature &&
    ["text/markdown", "text/plain", "application/json"].includes(extensionType)
  ) {
    detected = extensionType;
  } else throw new UnsafeUploadError("SIGNATURE_MISMATCH");
  if (detected !== extensionType)
    throw new UnsafeUploadError("EXTENSION_MISMATCH");
  if (["text/markdown", "text/plain", "application/json"].includes(detected)) {
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
        input.bytes,
      );
      if (decoded.includes("\u0000")) throw new Error("NUL byte");
    } catch {
      throw new UnsafeUploadError("TEXT_BINARY_CONTENT");
    }
  }
  const declared = input.declaredMediaType.split(";")[0]!.trim().toLowerCase();
  if (declared !== detected && declared !== "application/octet-stream")
    throw new UnsafeUploadError("DECLARED_TYPE_MISMATCH");
  return detected;
}
