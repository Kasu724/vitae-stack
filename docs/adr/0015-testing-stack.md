# ADR-0015: Standardize on layered TypeScript and browser testing

- **Status:** Accepted
- **Date:** 2026-06-28

## Context

The project needs fast domain tests plus real PostgreSQL, browser/accessibility, parser, export, security, and AI evaluation coverage.

## Decision

Use Vitest for TypeScript unit/integration/contract tests, PostgreSQL containers/Compose for DB tests, Playwright for E2E and export rendering checks, axe-core for automated accessibility, and repository-specific fixture/eval harnesses. Add property testing where invariants benefit. Exact libraries are pinned in M01.

## Alternatives considered

Jest is established but Vitest aligns with modern ESM/TypeScript speed. Cypress is capable but Playwright covers multi-browser/download/PDF flows and is already an export candidate. Browser-only or unit-only strategies miss trust boundaries.

## Consequences

One primary language simplifies tests; container/browser CI costs are controlled by tiers. Manual screen-reader/security/recovery checks remain necessary. Synthetic fixture governance is part of the test system.

## Security and privacy implications

Network is denied by default, secrets are absent from fork tests, real user data is prohibited, and malicious fixtures run in isolation. Security/provenance/deletion tests cannot be quarantined to pass CI.

## Revisit conditions

Tool maintenance/ESM incompatibility, accessibility coverage evidence, or a materially faster stack with equal browser/security coverage.
