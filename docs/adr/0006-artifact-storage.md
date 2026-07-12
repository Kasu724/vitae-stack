# ADR-0006: Use private filesystem storage by default

- **Status:** Accepted; deployment boundary amended by [ADR-0021](0021-local-sqlite-no-account-runtime.md)
- **Date:** 2026-06-28

## Context

Uploaded sources and generated exports are binary, potentially large, sensitive, and unsuitable for routine database rows. Default deployment must not require a hosted object store, while multi-replica operators need an option.

## Decision

Define an artifact-store interface (`put/get/delete/stat`) with opaque keys, checksums, size/type metadata, and streaming. The MVP implementation uses a private local filesystem folder beside SQLite. S3-compatible storage is outside the supported local release. Authorized application routes stream downloads.

## Alternatives considered

Database blobs simplify transactions/backups but increase database size/restore coupling. S3-only creates service/setup dependence. Public/static directories and signed URLs expose configuration/cache risks; signed URLs may be an optional S3 implementation detail later.

## Consequences

One-host setup and backups are understandable. Filesystem is not suitable for unsynchronized replicas. Cross-store operations need idempotent cleanup/orphan reconciliation because database and object writes are not one transaction.

## Security and privacy implications

Storage root is never web-served; paths are generated, traversal-safe, least-privilege, and encrypted-at-rest by operator infrastructure where required. Downloads reauthorize. Deletion verifies keys and backups include both stores.

## Revisit conditions

Multi-node reference deployment, database-blob performance evidence, or a portable content-addressed/encrypted storage design with simpler consistency.

## Implementation note (M06)

The filesystem adapter uses exclusive mode-0600 writes where supported, opaque `<workspace UUID>/<object UUID>` keys, canonical-root checks, atomic parser envelopes, and deletion before database tombstoning. Parser/runtime queues are separate subdirectories in the local data folder.
