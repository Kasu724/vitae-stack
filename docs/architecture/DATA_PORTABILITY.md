# Data portability

## Implemented archive contract

M18 archive schema version 1 is JSON (`application/json`, maximum 50 MiB) with these top-level fields:

| Field               | Meaning                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `schemaVersion`     | Integer `1`; independently versioned from HTTP and database schemas     |
| `product`           | Literal `vitae-stack`                                                   |
| `exportedAt`        | RFC 3339 timestamp                                                      |
| `sourceWorkspaceId` | Source identifier used for audit/conflict reporting                     |
| `options`           | Whether source and unexpired export bytes were requested                |
| `tables`            | Every allowlisted portable collection, including empty arrays           |
| `blobs`             | Optional base64 bytes with kind, resource ID, media type, size, SHA-256 |
| `warnings`          | Missing optional artifact notices without source content                |

Portable collections cover career profile/settings/entries/skills/evidence, sources and extraction decisions, documents/versions/claims/locks, jobs/revisions/requirements/matches, tailoring history, immutable ATS reports with nonsecret AI provenance, sanitized provider configurations, and optionally unexpired export metadata. Authentication identities, memberships, passwords, sessions, rate limits, raw credentials or ciphertext, audit events, transient job leases, and deletion operations are excluded.

Export makes no provider calls. Stale or unsupported export artifacts are omitted rather than copied, and provider credential fields are removed. Import validates the full schema, known table columns, UUID/composite identities, cross-record context, canonical document/job hashes, complete claim grounding, artifact manifests, row/blob bounds, decoded size/SHA-256, and absence of secret-bearing values before writes. User references remap to the importing owner, the source career profile remaps to the target profile, source/artifact storage keys are regenerated, and provider authentication is reset to `none`/`unverified`.

## Dry-run and conflict policy

`POST /api/portability/import` with `mode=dry-run` reports per-table counts, optional blob counts, existing target rows, global identifier conflicts, secret fields, reasons, and `canApply`. It does not write database or storage state. Schema version 1 applies only when the target contains no product records beyond its bootstrap career profile/settings and no archive UUID collides elsewhere in the instance. `mode=apply` stages validated blobs, then repeats semantic, schema, target-emptiness, and identifier checks inside the same immediate database transaction that performs inserts. Any failure rolls back relational writes and removes newly written blobs.

MVP intentionally rejects populated-workspace merge, archive identity transfer, cross-instance synchronization, and external-provider deletion. Users can export the current workspace, create an empty target on the destination instance, dry-run, then apply.

## Deletion relation

Portability export should precede permanent deletion when recovery is desired. An application export is the user-controlled recovery path after active deletion. Vitae Stack creates no managed/operator backup and cannot expire copies the user made outside its data folder. A physical restore must carry the newest deletion ledger forward so an older database copy cannot silently resurrect a deletion request. See [retention and deletion](../security/DATA_RETENTION_AND_DELETION.md), [backup and restore](../operations/BACKUP_AND_RESTORE.md), and [ADR-0019](../adr/0019-portability-deletion-and-backup-replay.md).
