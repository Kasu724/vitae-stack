# Document ingestion pipeline

```mermaid
sequenceDiagram
  participant U as User
  participant A as Local application
  participant F as Private files folder
  participant P as Bounded parser child
  participant D as SQLite
  U->>A: Upload allowlisted document
  A->>A: Stream, cap, hash, verify signature/type
  A->>F: Store opaque quarantined bytes
  A->>P: Bounded schema-versioned parse request
  P-->>A: Validated text/metadata/warnings or typed failure
  A->>D: Save source and unverified extraction proposals
  A-->>U: Show proposals with source locators
  U->>A: Edit/approve/reject
  A->>D: Create immutable approved evidence
```

Supported inputs are PDF embedded text, DOCX, Markdown, plain text, and versioned project JSON. OCR, macros, scripts, remote resources, executable templates, and pixel-perfect layout recovery are excluded. Every trust boundary has byte, entry, decompression, text, and time limits.

The parser child receives no model-provider credential and returns a closed schema. Parser text is never approved automatically and prompt-like content stays inert. Approval records immutable evidence IDs and source locators; corrections create superseding facts.

Source metadata is stored in SQLite while bytes use opaque names in the local files folder. Deleting bytes removes extracted source text and makes retained approved-fact locators unavailable. See [file upload security](../security/FILE_UPLOAD_SECURITY.md).
