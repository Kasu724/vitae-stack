# ADR-0015: Standardize on layered TypeScript and browser testing

- **Status:** Accepted; database/deployment fixtures amended by [ADR-0021](0021-local-sqlite-no-account-runtime.md)
- **Date:** 2026-06-28

## Context

The project needs fast domain tests plus real SQLite, browser, parser, export, security, packaging, and AI evaluation coverage.

## Decision

Use Vitest for TypeScript unit/integration/contract tests with temporary SQLite files, Playwright for E2E/package checks, and repository-specific parser/export/security/evaluation fixtures. No container service is required. Exact libraries are pinned.

## Alternatives considered

Jest is established but Vitest aligns with modern ESM/TypeScript speed. Cypress is capable but Playwright covers multi-browser/download/PDF flows and is already an export candidate. Browser-only or unit-only strategies miss trust boundaries.

## Consequences

One primary language simplifies tests; container/browser CI costs are controlled by tiers. Manual security and recovery checks remain necessary. Synthetic fixture governance is part of the test system.

## Security and privacy implications

Network is denied by default, secrets are absent from fork tests, real user data is prohibited, and malicious fixtures run in isolation. Security/provenance/deletion tests cannot be quarantined to pass CI.

## Revisit conditions

Tool maintenance/ESM incompatibility, or a materially faster stack with equal browser/security coverage.
