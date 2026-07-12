# File upload security

## Allowlist and limits

MVP accepts PDF, DOCX, Markdown, plain text, and versioned project JSON. The request body is capped at 10 MiB by default. Validation checks extension, declared media type, and detected signature; mismatches, encrypted inputs, unsupported ZIP members, macros/active content, excess entries, excess expanded bytes, high compression ratios, and excess extracted text fail before approval data is created.

Uploads stream to an opaque private path below the local data folder. User filenames are metadata only and never become paths. Canonical-root checks reject traversal and symlink escape. Source bytes are never served as public static files.

## Parser boundary

Parsing runs in a bounded child process shipped with the application. It receives only the selected input and a schema-versioned request, has a wall-clock timeout and text/byte limits, and returns a schema-validated envelope. It receives no provider credential. A crash, timeout, malformed result, or missing result is a typed failure, never a successful empty parse. The local child-process boundary reduces accidental application-state access but is not claimed to be an operating-system sandbox.

DOCX is treated as hostile ZIP/XML; macros, executable relationships, external resources, DTD/entity expansion, and unsafe paths are rejected. PDF parsing extracts embedded text only; OCR is outside MVP. Markdown/text/JSON are decoded with strict size and encoding limits. Parsed prompt-like text remains inert user data.

## Storage and logging

Failed temporary data is removed on a bounded schedule. Deleting source bytes removes the stored file and extracted source text while explicitly approved facts may remain marked `source unavailable`. Logs contain only operation IDs, coarse types, sizes, durations, and safe error codes—never filenames where avoidable, document text, extracted text, prompts, credentials, or model output.

Tests cover spoofing, traversal, polyglots, malformed/encrypted PDFs, DOCX macros/external relationships, decompression bombs, excess XML/entries/text, parser crash/timeout, output injection, and source deletion.
