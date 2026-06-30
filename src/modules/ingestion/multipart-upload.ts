import Busboy from "busboy";

import { UnsafeUploadError } from "./file-validation";

export interface MultipartUpload {
  purpose: string;
  filename: string;
  mediaType: string;
  bytes: Buffer;
}

export async function readBoundedMultipartUpload(
  request: Request,
  maximumBytes: number,
): Promise<MultipartUpload> {
  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > maximumBytes + 64 * 1024
  )
    throw new UnsafeUploadError("FILE_TOO_LARGE");
  if (!request.body) throw new UnsafeUploadError("FILE_REQUIRED");

  return new Promise<MultipartUpload>((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({
        headers: Object.fromEntries(request.headers),
        limits: {
          fileSize: maximumBytes,
          files: 1,
          fields: 1,
          fieldSize: 100,
          // Busboy emits partsLimit when it encounters the final boundary at
          // an exact limit, so allow one sentinel beyond the two accepted parts.
          parts: 3,
        },
      });
    } catch {
      reject(new UnsafeUploadError("INVALID_MULTIPART"));
      return;
    }
    let purpose = "";
    let filename = "";
    let mediaType = "";
    let fileSeen = false;
    let tooLarge = false;
    const chunks: Buffer[] = [];
    parser.on("field", (name, value) => {
      if (name === "purpose") purpose = value;
    });
    parser.on("file", (name, stream, info) => {
      if (name !== "file") {
        stream.resume();
        return;
      }
      fileSeen = true;
      filename = info.filename;
      mediaType = info.mimeType;
      stream.on("limit", () => {
        tooLarge = true;
      });
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    });
    parser.on("filesLimit", () =>
      reject(new UnsafeUploadError("TOO_MANY_FILES")),
    );
    parser.on("partsLimit", () =>
      reject(new UnsafeUploadError("INVALID_MULTIPART")),
    );
    parser.on("error", () =>
      reject(new UnsafeUploadError("INVALID_MULTIPART")),
    );
    parser.on("finish", () => {
      if (tooLarge) reject(new UnsafeUploadError("FILE_TOO_LARGE"));
      else if (!fileSeen) reject(new UnsafeUploadError("FILE_REQUIRED"));
      else
        resolve({ purpose, filename, mediaType, bytes: Buffer.concat(chunks) });
    });
    void (async () => {
      try {
        for await (const chunk of request.body!)
          parser.write(Buffer.from(chunk));
        parser.end();
      } catch {
        reject(new UnsafeUploadError("INVALID_MULTIPART"));
      }
    })();
  });
}
