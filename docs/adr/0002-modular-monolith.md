# ADR-0002: Use a modular monolith

- **Status:** Accepted; runtime topology amended by [ADR-0021](0021-local-sqlite-no-account-runtime.md)
- **Date:** 2026-06-28

## Context

MVP needs web/API, persistence, parsing, model calls, ATS rules, exports, and background work. A small open-source team must operate it on one host without premature distributed-systems costs.

## Decision

Build one repository/deployable application codebase with explicit domain modules and a separately runnable worker using the same packages. PostgreSQL and artifact storage are the only required stateful dependencies. Module boundaries are enforced by imports/contracts and transactional application services.

## Alternatives considered

Microservices add network/auth/observability/deployment failure modes. A fully synchronous monolith makes untrusted/slow parsing and generation block requests. Desktop-only local software limits multi-user and web self-hosting paths.

## Consequences

Development, transactions, and deployment remain simple. App and worker can scale separately, but share release cadence and database. Poor module discipline could produce coupling, so contract tests and dependency rules are required.

## Security and privacy implications

Fewer network boundaries reduce attack surface; the worker/parser/exporter still require process/container isolation. One database makes workspace-scoping errors high impact, requiring adversarial isolation tests.

## Revisit conditions

Measured independent scaling/failure/isolation need that cannot be met by process separation, or organizational ownership that justifies a service boundary.
