# ADR-0004: Use PostgreSQL with Drizzle ORM

- **Status:** Accepted
- **Date:** 2026-06-28

## Context

The domain has relational ownership, immutable history, many-to-many evidence, transactions, JSON schemas, search, job leases, and migration requirements. Development/production dialect parity matters more than an embedded database.

## Decision

Use PostgreSQL 16+ in every supported runtime and Drizzle ORM/Kit for typed schema/query/migration generation. Review and commit SQL migrations; use separate runtime/migration roles. Host development runs only PostgreSQL in Docker as the lightweight option. No SQLite compatibility promise.

## Alternatives considered

Prisma has strong tooling but a heavier generated client/runtime. TypeORM has broader abstraction and more runtime magic. Raw SQL maximizes control but increases routine type/mapping work. SQLite/PGlite improves zero-install setup but risks dialect/constraint/concurrency drift; PGlite may be test-only experimentation.

## Consequences

Strong transactions, constraints, JSONB/search, and job locking are available without proprietary services. Contributors need Docker/PostgreSQL. ORM abstractions do not replace SQL review, query plans, or ownership constraints.

## Security and privacy implications

Parameterized queries and least-privilege roles are mandatory. Composite workspace constraints reduce cross-tenant references. The M02 security review resolved OQ-03: MVP does not enable RLS. Application-service authorization, mandatory workspace predicates, composite ownership foreign keys, and adversarial isolation tests are the primary controls. Schema design keeps non-null workspace ownership so RLS can be added later without changing domain identity.

## Revisit conditions

Drizzle maintenance/security degrades, migration limitations block safety, or an embedded personal edition can prove full semantic/migration parity.
