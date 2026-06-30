# File upload security

## Policy

Allow only PDF, DOCX, UTF-8 Markdown/plain text, and versioned project JSON. Default maximum is 10 MiB per source, 200 pages, 100k words; DOCX/JSON archives additionally cap 100 entries, 20 MiB expanded bytes, path depth 10, and compression ratio 20:1. Hard caps are compiled/tested safety ceilings; operator configuration may lower them.

Validate filename length/control characters for display only; generate opaque storage keys. Require extension, declared MIME, magic/signature, and parser result to agree. Reject legacy DOC, RTF, executable/polyglot, encrypted/password-protected, macro-enabled, embedded package/OLE, external relationship, symlink/path traversal, malformed archive/XML, and unknown content. Never execute macros, links, fonts, media, or office software.

Upload streams to quarantine with request/body limits and checksum; it is not served publicly or parsed in the web process. Parser jobs run in an externally network-restricted process/container under nonroot identity, with no application/database/provider credentials, read-only input, isolated temp, and memory/CPU/wall/process/file-descriptor caps. Node permission flags may reduce accidental access but are not treated as containment for malicious code. Temporary and failed objects are erased on schedule. If optional malware scanning is configured, failure is fail-closed; scanning does not replace parsing controls.

Parser output is untrusted: validate schema/length/locators, normalize Unicode, strip control/bidi abuse where unsafe while preserving warnings, and render as escaped text. Image-only PDF pages are marked unsupported; no OCR fallback.

Tests include magic/MIME spoofing, polyglots, ZIP slip, nested/huge archives, billion-laughs XML, external relationships, malformed PDF xrefs, huge page dimensions/fonts, control characters, parser hangs/crashes, and cleanup after every failure.

## Implemented M06 controls

The upload route parses multipart data as a stream with a hard file-size limit, exact-origin check, one-file/one-purpose limits, and a 20-per-workspace hourly rate limit. It uses opaque UUID storage keys under a non-public root; filenames are display metadata only. `file-type` 22.0.1 checks signatures. DOCX preflight with `yauzl` 3.4.0 enforces 100 entries, 20 MiB expanded bytes, 20:1 ratio, depth 10, no encryption/symlinks/traversal/nesting/macros/embeddings, no DTD/entities, and no external relationships before Mammoth 1.12.0 raw-text extraction. PDF.js 6.1.200 extracts embedded text only with 200-page, dimension, text, word, process-memory, and wall-time limits. Text/Markdown/JSON require UTF-8; JSON requires schema version 1. Directional controls are removed with warnings, and previews use escaped text.

Development uses the same bounded child-process parser in `PARSER_MODE=inline`. Production configuration rejects inline mode. Compose runs a nonroot parser sidecar with no network namespace or application/database credentials, capped memory/CPU/PIDs/file descriptors, read-only source bytes, and a separate writable result queue. Failed parser inputs are deleted; only safe error metadata remains.
