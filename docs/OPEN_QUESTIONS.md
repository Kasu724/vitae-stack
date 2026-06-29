# Open questions

These questions are non-blocking for the MVP plan. Owners resolve them with an ADR or product decision before the named gate; defaults below permit implementation to proceed.

| ID    | Question                                                                                | Working default                                                              | Resolve by                         |
| ----- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------- |
| OQ-01 | Which maintained PDF and DOCX parser versions pass the malicious-fixture evaluation?    | `pdfjs-dist` and `mammoth`, isolated behind parser interfaces                | M06 dependency review              |
| OQ-02 | Which DOCX generator best preserves accessible headings and lists?                      | `docx`; fall back to HTML/Markdown if conformance fails                      | M05 schema/export spike            |
| OQ-04 | What backup tooling should the reference Compose deployment recommend?                  | Encrypted `pg_dump` plus artifact-directory snapshot, operator scheduled     | Before M18 deletion implementation |
| OQ-05 | Which English locale/date variants ship in the first ATS ruleset?                       | US English plus locale-neutral ISO/date-range parsing                        | M16 fixture sign-off               |
| OQ-06 | Can local models meet extraction and grounding thresholds on reference hardware?        | Support them without promising parity; publish per-model eval results        | M12/M21 evals                      |
| OQ-07 | What is the minimum practical mobile editor width?                                      | Review/suggest at 320 CSS px; complex reordering may use simplified controls | Before M15 editor implementation   |
| OQ-08 | Should a future deployment support external OIDC without bundling an identity provider? | Post-MVP adapter; email/password remains the reference path                  | Post-MVP roadmap review            |

No open question permits weakening evidence grounding, final-export blocking, workspace isolation, SSRF controls, or permanent deletion.

## Resolved

- **OQ-03 (M02):** MVP uses application-service authorization, workspace-scoped repositories, composite ownership constraints, and adversarial tests. PostgreSQL RLS is deferred defense-in-depth. See [ADR-0004](adr/0004-postgresql-drizzle.md).
