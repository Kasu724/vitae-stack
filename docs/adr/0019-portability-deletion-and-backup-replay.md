# ADR-0019: Portability, deletion, and backup replay

**Status:** Accepted

## Context

MVP users must be able to export and re-import project data, remove source bytes without invalidating approved facts, and permanently delete a workspace. A relational cascade alone is insufficient: storage deletion can fail independently, and restoring a backup made before deletion could resurrect the workspace. The reference deployment must remain self-hostable and must not depend on a proprietary backup or archive service.

## Decision

Use a versioned, allowlisted JSON archive with optional base64 source and unexpired export bytes. The archive includes workspace-owned product records and provenance but excludes identities, sessions, audit events, ephemeral jobs, credentials, tokens, and deletion receipts. Provider destinations and task assignments are retained; imported provider records use `auth_type=none` and `status=unverified`. Import always performs schema, size, blob-hash, secret-field, target-content, and identifier-conflict checks. MVP apply is allowed only into an otherwise empty workspace; ambiguous record merging is rejected.

Source-binary deletion removes the byte object and extracted preview, changes the source row to `deleted`, and retains approved evidence. Provenance renders the source as unavailable.

Workspace deletion uses an idempotent operation stored outside the workspace foreign-key aggregate. Requesting deletion requires recent authentication and the exact typed phrase, freezes workspace writes in PostgreSQL, writes a content-free tombstone to the private artifact volume, removes source/export/queue files, deletes workspace rows and the personal account, verifies through transaction results, and returns a content-free receipt. A restricted deletion worker retries failures. On restore, the worker replays artifact-volume tombstones; request authorization also refuses a workspace with a tombstone, preventing restored data from being exposed before replay finishes.

The reference backup is a coordinated encrypted PostgreSQL custom-format dump plus encrypted private-volume snapshot, created after writes are stopped or from a consistency-capable snapshot pair. Operators retain both for at most 30 days and test restoration. The private snapshot must include `.deletions/` tombstones.

## Alternatives considered

- **Opaque database dumps as user exports:** not portable across project versions and can include secrets/auth data.
- **Automatic field-level merge import:** creates unresolved identity, immutable-history, and provenance conflicts; deferred until a deterministic merge contract exists.
- **Database-only deletion receipt:** cannot protect restores from an older backup.
- **Immediate synchronous deletion without durable state:** loses recovery after process or storage failure.
- **Hosted backup/object services:** optional integrations may exist later but cannot be required by the reference deployment.

## Consequences

Archives are larger when bytes are included and capped at 50 MiB. Importing into a populated workspace requires a separate user decision outside MVP; dry-run explains the conflict without writes. Content-free tombstones are retained beyond active deletion and must travel with backup restores. The request attempts deletion synchronously for clear feedback, while the worker provides durable retry.

## Security and privacy implications

Archive table names are an internal allowlist, not user-controlled SQL. Blob sizes and hashes are checked before writes; storage keys are regenerated for the target workspace. Secret-bearing fields block import and are absent from export. Full export/import/delete require recent authentication and exact-origin requests. Tombstones contain only operation/workspace IDs, a one-way requester hash, and timestamps. Database triggers reject writes after freeze except the deletion transaction's scoped internal setting.

## Revisit conditions

Revisit for archives above 50 MiB, encrypted user archives, cross-instance merge/sync, shared workspaces, external storage, selective backup erasure, or an operator backup system that provides atomic database/volume snapshots and native deletion ledgers.
