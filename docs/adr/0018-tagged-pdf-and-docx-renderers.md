# ADR-0018: Use bounded tagged-PDF and structured-DOCX renderers

- **Status:** Accepted
- **Date:** 2026-06-30

## Context

ADR-0012 selected network-disabled Chromium for PDF before implementation evidence existed. M17 needs a fixed single-column renderer with selectable text, logical headings/lists, predictable self-hosting, no network or browser runtime, parse-back validation, and no executable templates. It also needs a maintained TypeScript DOCX generator. The canonical document schema already restricts content to plain typed sections and blocks, so HTML layout is unnecessary for the MVP template.

Official PDFKit documentation describes tagged content, logical structure, language, title metadata, and PDF/UA output. Official `docx` documentation exposes built-in heading levels, list paragraphs, language styles, and a Node buffer packer. Versions were verified against the npm registry on 2026-06-30: PDFKit 0.19.1, `docx` 9.7.1, and `@types/pdfkit` 0.17.6. See [PDFKit accessibility](https://pdfkit.org/docs/accessibility.html), [PDFKit getting started](https://pdfkit.org/docs/getting_started.html), [`docx` documentation](https://docx.js.org/), and [`docx` heading levels](https://docx.js.org/api/variables/HeadingLevel.html).

## Decision

Use PDFKit 0.19.1 for a repository-owned, tagged, English-US, single-column PDF/UA-marked template. Use `docx` 9.7.1 for macro-free DOCX with built-in heading and list semantics. Markdown, text, and JSON use repository-owned direct renderers. Strip directional formatting controls, escape Markdown HTML, prohibit external relationships/templates, bound output to 10 MiB, and require at least 98% ordered token coverage after PDF/DOCX parse-back.

Render synchronously in the web process for MVP because canonical input is already capped, the renderers execute no user code or network access, and measured synthetic outputs finish within the request budget. Serialize identical version/format requests with a PostgreSQL advisory lock, persist an immutable manifest and hashes, store opaque private bytes for 24 hours, and reuse identical unexpired artifacts. Move rendering to the existing database-backed job boundary only if measured latency/resource budgets require it.

Final PDF/DOCX is refused when any tracked factual claim is unverified, lacks evidence, cites a non-approved fact, or belongs to an archived entry. Markdown/text/JSON may be produced as visibly and structurally labeled drafts. Downloads are workspace-authorized attachments with integrity verification, `nosniff`, private/no-store caching, and sandbox policy.

## Alternatives considered

- Sandboxed Chromium from ADR-0012 supports richer CSS but adds a large browser image, sandbox/patch surface, and HTML rendering boundary unnecessary for one typed template.
- LibreOffice adds process isolation, conversion variability, and a larger operational attack surface.
- `pdf-lib` is already used in tests but lacks the documented high-level tagged logical-structure workflow needed here.
- Manual OOXML ZIP construction reduces dependencies but increases schema, accessibility, relationship, and maintenance risk.
- Hosted conversion conflicts with privacy, offline/self-hosted operation, and lock-in constraints.

## Consequences

The default image remains smaller and rendering has no egress or executable-template boundary. The MVP is intentionally one single-column template and does not preserve imported layout. PDFKit's PDF/UA marker and logical structure improve accessibility but are not a legal conformance guarantee; parse-back, Poppler metadata, visual pagination, assistive-technology spot checks, and disclosed limitations remain release gates. Output byte identity across library upgrades is not promised, so renderer versions are pinned in every manifest.

## Security and privacy implications

No document content leaves the instance. Renderers receive only validated canonical plain text, use no remote resources, and create no HTML or macros. Output bounds, rate limits, post-render parse-back, content hashes, private opaque storage, same-origin mutation checks, workspace-scoped reads, and attachment-only delivery limit injection, denial-of-service, and cross-user exposure. Dependencies remain security-sensitive and cannot be auto-upgraded without fixtures and visual/accessibility review.

## Revisit conditions

Revisit if PDFKit cannot meet tagged reading-order or glyph requirements, DOCX consumers lose headings/lists, real fixtures exceed request/performance budgets, PDF/UA validation identifies a release-blocking defect, broader locales require embedded fonts/shaping, or a second layout template becomes an accepted MVP requirement.
