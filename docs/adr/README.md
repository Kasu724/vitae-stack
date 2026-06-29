# Architecture decision records

Accepted ADRs are authoritative for technical decisions. Superseding a decision requires a new ADR; do not rewrite history beyond typo/link corrections.

| ADR                                          | Decision                                     | Status   |
| -------------------------------------------- | -------------------------------------------- | -------- |
| [0001](0001-agpl-3-license.md)               | AGPL-3.0-only license                        | Accepted |
| [0002](0002-modular-monolith.md)             | Modular monolith                             | Accepted |
| [0003](0003-typescript-nextjs.md)            | TypeScript, Node, React, Next.js             | Accepted |
| [0004](0004-postgresql-drizzle.md)           | PostgreSQL and Drizzle ORM                   | Accepted |
| [0005](0005-authentication-modes.md)         | Password and trusted-local auth modes        | Accepted |
| [0006](0006-artifact-storage.md)             | Filesystem default, S3-compatible option     | Accepted |
| [0007](0007-structured-career-model.md)      | Structured career bank and immutable facts   | Accepted |
| [0008](0008-ai-provider-abstraction.md)      | Provider-neutral AI tasks/adapters           | Accepted |
| [0009](0009-evidence-provenance.md)          | Claim-to-evidence provenance                 | Accepted |
| [0010](0010-deterministic-ats.md)            | Deterministic explainable ATS estimate       | Accepted |
| [0011](0011-document-editor-architecture.md) | Typed document editor and immutable versions | Accepted |
| [0012](0012-export-strategy.md)              | Safe repository-owned exporters              | Accepted |
| [0013](0013-database-backed-jobs.md)         | PostgreSQL-backed background jobs            | Accepted |
| [0014](0014-self-hosted-deployment.md)       | Docker Compose reference deployment          | Accepted |
| [0015](0015-testing-stack.md)                | Vitest, Playwright, axe, and fixture suites  | Accepted |
| [0016](0016-observability-and-privacy.md)    | Local content-free observability             | Accepted |
| [0017](0017-ssrf-safe-url-fetching.md)       | Dedicated SSRF-safe fetcher                  | Accepted |

Each record includes context, decision, alternatives, consequences, security/privacy implications, and revisit conditions. “Accepted” means planned architecture, not implemented capability.
