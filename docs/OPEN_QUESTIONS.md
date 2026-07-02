# Open questions

These questions are non-blocking for the MVP plan. Owners resolve them with an ADR or product decision before the named gate; defaults below permit implementation to proceed.

| ID    | Question                                                                                | Working default                                                       | Resolve by              |
| ----- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------- |
| OQ-05 | Which English locale/date variants ship in the first ATS ruleset?                       | US English plus locale-neutral ISO/date-range parsing                 | M16 fixture sign-off    |
| OQ-06 | Can local models meet extraction and grounding thresholds on reference hardware?        | Support them without promising parity; publish per-model eval results | M12/M21 evals           |
| OQ-08 | Should a future deployment support external OIDC without bundling an identity provider? | Post-MVP adapter; email/password remains the reference path           | Post-MVP roadmap review |

No open question permits weakening evidence grounding, final-export blocking, workspace isolation, SSRF controls, or permanent deletion.

## Resolved

- **OQ-07 (M20):** All MVP editor and suggestion-review controls remain available in a single-column layout at 320 CSS px. Drag/reorder is outside the MVP; any future reorder interaction must include keyboard-operable controls. See [accessibility validation](design/ACCESSIBILITY_VALIDATION.md).

- **OQ-04 (M18):** The reference backup is a coordinated, encrypted PostgreSQL custom-format dump plus encrypted artifact-volume snapshot. Retention is at most 30 days, restore tests are required, and the snapshot includes deletion tombstones for replay before access. See [ADR-0019](adr/0019-portability-deletion-and-backup-replay.md).

- **OQ-03 (M02):** MVP uses application-service authorization, workspace-scoped repositories, composite ownership constraints, and adversarial tests. PostgreSQL RLS is deferred defense-in-depth. See [ADR-0004](adr/0004-postgresql-drizzle.md).
- **OQ-01 (M06):** The isolated parser adapters pin `pdfjs-dist` 6.1.200 and `mammoth` 1.12.0. Focused supported-format and malicious DOCX/parser-limit tests pass locally; the full container gate remains part of M06 completion.
- **OQ-02 (M17):** MVP pins `docx` 9.7.1 for semantic headings/lists and PDFKit 0.19.1 for tagged PDF. Parse-back, macro/external-relationship rejection, Poppler metadata, and visual pagination tests are mandatory. See [ADR-0018](adr/0018-tagged-pdf-and-docx-renderers.md).
