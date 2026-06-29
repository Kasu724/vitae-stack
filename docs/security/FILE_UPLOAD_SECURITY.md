# File upload security

## Policy

Allow only PDF, DOCX, UTF-8 Markdown/plain text, and versioned project JSON. Default maximum is 10 MiB per source, 200 pages, 100k words; DOCX/JSON archives additionally cap 100 entries, 20 MiB expanded bytes, path depth 10, and compression ratio 20:1. Hard caps are compiled/tested safety ceilings; operator configuration may lower them.

Validate filename length/control characters for display only; generate opaque storage keys. Require extension, declared MIME, magic/signature, and parser result to agree. Reject legacy DOC, RTF, executable/polyglot, encrypted/password-protected, macro-enabled, embedded package/OLE, external relationship, symlink/path traversal, malformed archive/XML, and unknown content. Never execute macros, links, fonts, media, or office software.

Upload streams to quarantine with request/body limits and checksum; it is not served publicly or parsed in the web process. Parser jobs run in an externally network-restricted process/container under nonroot identity, with no application/database/provider credentials, read-only input, isolated temp, and memory/CPU/wall/process/file-descriptor caps. Node permission flags may reduce accidental access but are not treated as containment for malicious code. Temporary and failed objects are erased on schedule. If optional malware scanning is configured, failure is fail-closed; scanning does not replace parsing controls.

Parser output is untrusted: validate schema/length/locators, normalize Unicode, strip control/bidi abuse where unsafe while preserving warnings, and render as escaped text. Image-only PDF pages are marked unsupported; no OCR fallback.

Tests include magic/MIME spoofing, polyglots, ZIP slip, nested/huge archives, billion-laughs XML, external relationships, malformed PDF xrefs, huge page dimensions/fonts, control characters, parser hangs/crashes, and cleanup after every failure.
