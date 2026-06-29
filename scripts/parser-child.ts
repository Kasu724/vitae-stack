import { readFile } from "node:fs/promises";

import type { SupportedMediaType } from "../src/modules/ingestion/file-validation";
import { UnsafeUploadError } from "../src/modules/ingestion/file-validation";
import { parseSourceBuffer } from "../src/modules/ingestion/parsers";

const [filePath, mediaType, maximumText] = process.argv.slice(2);
if (!filePath || !mediaType || !maximumText) process.exit(64);

try {
  const result = await parseSourceBuffer(
    mediaType as SupportedMediaType,
    await readFile(filePath),
    Number(maximumText),
  );
  process.stdout.write(JSON.stringify({ ok: true, result }));
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      errorCode:
        error instanceof UnsafeUploadError ? error.code : "PARSER_FAILED",
    }),
  );
  process.exitCode = 2;
}
