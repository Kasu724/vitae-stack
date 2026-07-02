# Export pipeline

```mermaid
sequenceDiagram
  participant U as User
  participant A as Authorized API
  participant G as Claim gate
  participant R as Fixed renderer
  participant V as Parse-back validator
  participant S as Private artifact store
  U->>A: Version + format
  A->>A: Same-origin + workspace authorization + rate limit
  A->>G: Current claim/evidence state
  alt Unsupported PDF or DOCX
    G-->>U: 409 + remediation link
  else Permitted final or labeled draft
    G->>R: Canonical JSON + fixed template
    R->>V: Bounded bytes
    V->>V: Parse/open + ordered text coverage + structure checks
    V->>S: Opaque 0600 object + immutable hash manifest
    S-->>U: Authorized attachment URL, 24-hour expiry
  end
```

## Implemented M17 boundary

The MVP uses one repository-owned `ats-safe-single-column@1` template. PDFKit 0.19.1 emits selectable tagged PDF with document language, title metadata, logical sections/headings/lists, reading-order writes, and a PDF/UA marker. `docx` 9.7.1 emits macro-free OOXML using built-in heading and list semantics. Markdown escapes HTML and Markdown controls; text is plain UTF-8; JSON contains schema/classification/unsupported-claim manifest plus canonical content. No renderer executes user templates, HTML, scripts, subprocesses, or network requests.

Generation accepts an explicitly selected immutable version. A factual claim is export-eligible only when it is `supported`, has at least one evidence link, every linked fact remains approved, and its entry remains active. PDF/DOCX violations return a machine-readable 409 and a focusable claim-remediation link. Markdown/text/JSON remain available as drafts with a visible warning and manifest identifiers. Newly entered or changed manual blocks are conservatively tracked as unverified whole-block claims; empty initial blocks do not create claims.

Every output is capped at 10 MiB. PDF and DOCX are parsed back using the pinned ingestion parsers and must retain at least 98% of normalized source tokens in order. Tests also assert tagged PDF metadata/selectable text, DOCX heading/list XML, absence of macros/external relationships, Unicode fixture handling, Markdown injection neutralization, and unsupported-claim blocking. Visual verification uses a two-page synthetic fixture to check margins, wrapping, hierarchy, continuation, clipping, and overlap. These checks demonstrate the fixture behavior; they do not provide legal PDF/UA or WCAG certification.

Artifact metadata pins the document version/hash, renderer/template versions, support-state input hash, byte hash/size, classification, warnings, requester, and expiry. Identical active inputs reuse one immutable artifact. Bytes use opaque private filesystem keys with mode 0600 and are served only after workspace authorization and hash/size verification, as attachments with `nosniff`, `private, no-store`, and sandbox headers. Unsaved artifacts expire after 24 hours; M18 owns cleanup/deletion reconciliation.

Synchronous rendering is the smallest safe architecture for the bounded MVP input and measured renderer latency. PostgreSQL advisory locks serialize identical work and the API limits each user to ten new artifacts per minute. The existing database-backed job boundary remains the recovery path if production measurements exceed request budgets. See [ADR-0018](../adr/0018-tagged-pdf-and-docx-renderers.md), [claim provenance](PROVENANCE_MODEL.md), and [retention](../security/DATA_RETENTION_AND_DELETION.md).
