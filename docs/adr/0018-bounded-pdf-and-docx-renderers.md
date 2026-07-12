# ADR-0018: Use bounded PDF and structured-DOCX renderers

- **Status:** Accepted
- **Date:** 2026-06-30

## Context

ADR-0012 selected network-disabled Chromium for PDF before implementation evidence existed. M17 needs a fixed single-column renderer with selectable text, logical headings/lists, predictable self-hosting, no network or browser runtime, parse-back validation, and no executable templates. It also needs a maintained TypeScript DOCX generator. The canonical document schema already restricts content to plain typed sections and blocks, so HTML layout is unnecessary for the MVP template.

Official PDFKit documentation describes embedded fonts, language, title metadata, and streamed Node output. Official `docx` documentation exposes built-in heading levels, list paragraphs, language styles, and a Node buffer packer. Versions were verified against the npm registry on 2026-06-30: PDFKit 0.19.1, `docx` 9.7.1, and `@types/pdfkit` 0.17.6. See [PDFKit getting started](https://pdfkit.org/docs/getting_started.html), [PDFKit text and fonts](https://pdfkit.org/docs/text.html), [`docx` documentation](https://docx.js.org/), and [`docx` heading levels](https://docx.js.org/api/variables/HeadingLevel.html).

## Decision

Use PDFKit 0.19.1 for a repository-owned, English-US, single-column PDF template. Embed a per-document subset of repository-bundled Noto Sans 2.015 under OFL-1.1 so Unicode text has an explicit `ToUnicode` mapping and rendering never depends on host fonts or network access. Use `docx` 9.7.1 for macro-free DOCX with built-in heading and list semantics. Markdown, text, and JSON use repository-owned direct renderers. Strip directional formatting controls, escape Markdown HTML, prohibit external relationships/templates, bound output to 10 MiB, require at least 98% ordered token coverage after PDF/DOCX parse-back, and require exact representative Unicode retention in renderer tests.

Render synchronously in the web process for MVP because canonical input is capped, the renderers execute no user code or network access, and measured synthetic outputs finish within budget. Serialize identical version/format requests through the local database mutex/transaction boundary, persist immutable manifests and hashes, store opaque private bytes for 24 hours, and reuse identical unexpired artifacts.

Final PDF/DOCX is refused when any tracked factual claim is unverified, lacks evidence, cites a non-approved fact, or belongs to an archived entry. Markdown/text/JSON may be produced as visibly and structurally labeled drafts. Downloads are workspace-authorized attachments with integrity verification, `nosniff`, private/no-store caching, and sandbox policy.

## Alternatives considered

- Sandboxed Chromium from ADR-0012 supports richer CSS but adds a large browser image, sandbox/patch surface, and HTML rendering boundary unnecessary for one typed template.
- LibreOffice adds process isolation, conversion variability, and a larger operational attack surface.
- `pdf-lib` is already used in tests but lacks the documented high-level tagged logical-structure workflow needed here.
- Manual OOXML ZIP construction reduces dependencies but increases schema, relationship, and maintenance risk.
- Hosted conversion conflicts with privacy, offline/self-hosted operation, and lock-in constraints.

## Consequences

The bundled hinted static font adds about 0.8 MiB to source and application artifacts but makes PDF glyph selection deterministic across hosts and avoids variable-font parsing overhead on the synchronous export path. Rendering still has no egress or executable-template boundary. The MVP is intentionally one single-column template and does not preserve imported layout. Parse-back, metadata inspection, visual pagination, and disclosed limitations remain release gates. Output byte identity across library or font upgrades is not promised, so renderer and template versions are pinned in every manifest.

## Security and privacy implications

No document content leaves the instance. Renderers receive only validated canonical plain text, use no remote resources, and create no HTML or macros. The font path is fixed code-owned input, its source and hashes are recorded, and its OFL license is distributed beside it. Output bounds, rate limits, post-render parse-back, content hashes, private opaque storage, same-origin mutation checks, workspace-scoped reads, and attachment-only delivery limit injection, denial-of-service, and cross-user exposure. Dependencies and bundled assets remain security-sensitive and cannot be upgraded without fixtures and visual review.

## Revisit conditions

Revisit if PDFKit cannot meet glyph or parse-back requirements, DOCX consumers lose headings/lists, real fixtures exceed request/performance budgets, a required script is outside Noto Sans coverage, complex shaping fails, or a second layout template becomes an accepted MVP requirement.
