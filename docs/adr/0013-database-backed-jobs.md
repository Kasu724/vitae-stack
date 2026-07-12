# ADR-0013: Use PostgreSQL-backed background jobs

- **Status:** Superseded by [ADR-0021](0021-local-sqlite-no-account-runtime.md)
- **Date:** 2026-06-28

## Context

Parsing, fetching, AI, export, portability, and deletion exceed reliable web-request lifetimes, but a Redis/broker dependency conflicts with simple self-hosting.

## Decision

Use a typed PostgreSQL job table with `SKIP LOCKED` claims, lease/heartbeat, attempts/deadlines, idempotency key, cancellation state, result reference, and dead-letter/operator visibility. Run workers separately from web using the same codebase. Keep ordinary CRUD and suggestion acceptance synchronous.

## Alternatives considered

In-process async work is lost on restart. Redis/BullMQ is mature but adds state/backup/operations. Managed queues lock deployments. Full workflow engines are premature.

## Consequences

One durable system supports small deployments and transactional enqueue. Queue load shares database capacity, so concurrency/retention/indexing are bounded. Long workflows use explicit chained jobs/state, not hidden recursion.

## Security and privacy implications

Payloads store IDs/hashes, not credentials/raw content. Workers reauthorize workspace/task state, use restricted role, cap resources, and redact failures. Deletion and chargeable jobs are idempotent.

## Revisit conditions

Measured queue volume harms primary database, cross-region execution is required, or workflows need durable features beyond auditable state machines.
