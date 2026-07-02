# ADR-0012: Render exports from canonical content using safe templates

- **Status:** Accepted; PDF renderer and synchronous MVP execution amended by [ADR-0018](0018-tagged-pdf-and-docx-renderers.md)
- **Date:** 2026-06-28

## Context

Users need PDF, DOCX, Markdown, text, and JSON without executable templates or hosted conversion services. Exports must retain text/structure and avoid unsupported claims.

## Decision

Use repository-owned schema-validated templates. Render PDF through network-disabled sandboxed Chromium from escaped local HTML; DOCX through a maintained structured generator; Markdown/text/JSON directly. Parse back and validate outputs. Final PDF/DOCX requires supported claims; artifacts are private and short-lived unless saved.

## Alternatives considered

Hosted conversion creates lock-in/privacy transfer. LibreOffice can improve fidelity but has a large attack/ops surface. LaTeX complicates contributor/template accessibility. User-uploaded HTML templates are too risky for MVP.

## Consequences

Self-hosted reproducible formats are feasible, with format-specific limitations and renderer weight. Visual and accessibility snapshot suites are required. Import layout is not pixel-preserved.

## Security and privacy implications

Renderer has no network/scripts, least privilege, bounded resources, local assets, escaping/CSP. Downloads are authorized attachments and partial artifacts are deleted.

## Revisit conditions

Chosen DOCX/PDF libraries cannot meet text/accessibility/maintenance gates, or safe declarative user templates become a validated requirement.
