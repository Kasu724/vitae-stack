# Architecture decision records

Accepted ADRs are authoritative for technical decisions. Superseding a decision requires a new ADR; do not rewrite history beyond typo/link corrections.

| ADR                                                    | Decision                                     | Status     |
| ------------------------------------------------------ | -------------------------------------------- | ---------- |
| [0001](0001-agpl-3-license.md)                         | AGPL-3.0-only license                        | Superseded |
| [0002](0002-modular-monolith.md)                       | Modular monolith                             | Accepted   |
| [0003](0003-typescript-nextjs.md)                      | TypeScript, Node, React, Next.js             | Accepted   |
| [0004](0004-postgresql-drizzle.md)                     | PostgreSQL and Drizzle ORM                   | Superseded |
| [0005](0005-authentication-modes.md)                   | Password and trusted-local auth modes        | Superseded |
| [0006](0006-artifact-storage.md)                       | Filesystem default, S3-compatible option     | Accepted   |
| [0007](0007-structured-career-model.md)                | Structured career bank and immutable facts   | Accepted   |
| [0008](0008-ai-provider-abstraction.md)                | Provider-neutral AI tasks/adapters           | Accepted   |
| [0009](0009-evidence-provenance.md)                    | Claim-to-evidence provenance                 | Accepted   |
| [0010](0010-deterministic-ats.md)                      | Deterministic explainable ATS estimate       | Superseded |
| [0011](0011-document-editor-architecture.md)           | Typed document editor and immutable versions | Accepted   |
| [0012](0012-export-strategy.md)                        | Safe repository-owned exporters              | Amended    |
| [0013](0013-database-backed-jobs.md)                   | PostgreSQL-backed background jobs            | Superseded |
| [0014](0014-self-hosted-deployment.md)                 | Docker Compose reference deployment          | Superseded |
| [0015](0015-testing-stack.md)                          | Vitest, Playwright, and fixture suites       | Accepted   |
| [0016](0016-observability-and-privacy.md)              | Local content-free observability             | Accepted   |
| [0017](0017-ssrf-safe-url-fetching.md)                 | Dedicated SSRF-safe fetcher                  | Accepted   |
| [0018](0018-bounded-pdf-and-docx-renderers.md)         | Bounded PDFKit and structured DOCX renderers | Accepted   |
| [0019](0019-portability-deletion-and-backup-replay.md) | Versioned archives and replay-safe deletion  | Amended    |
| [0020](0020-personal-no-login-release-default.md)      | Personal no-login release default            | Superseded |
| [0021](0021-local-sqlite-no-account-runtime.md)        | Local SQLite, no-account runtime             | Accepted   |
| [0022](0022-mit-license.md)                            | MIT license                                  | Accepted   |
| [0023](0023-ai-only-ats-analysis.md)                   | AI-only ATS analysis with optional job       | Accepted   |

Each record includes context, decision, alternatives, consequences, security/privacy implications, and revisit conditions. “Accepted” means planned architecture, not implemented capability.
