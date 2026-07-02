# Backup and restore operations

The reference backup is one inseparable encrypted pair: a PostgreSQL custom-format dump and a gzip archive of the complete private artifact volume. The artifact member includes source documents, exports, and `.deletions/` tombstones. Database-only or artifact-only backups are unsupported.

## Prerequisites

- Run from the repository directory on a host with Docker Compose, [age](https://github.com/FiloSottile/age) 1.3.1 or a later compatible 1.x release, `tar`, and `sha256sum`.
- Generate and escrow an age identity outside the repository. Place one or more corresponding public recipients in a readable recipients file; the backup host does not need the identity.
- Provide production PostgreSQL credentials through the deployment environment; the reference scripts use the Compose database service and database name.
- Ensure enough private disk space for one uncompressed working copy plus encrypted output.

## Create and verify a backup

The script stops write-capable services, dumps PostgreSQL, archives the full private volume, encrypts both members independently to the configured age recipients, writes transfer hashes and a content-free manifest, then restarts services. The short-lived archive container runs as root with only `DAC_READ_SEARCH` so it can read service-owned private files; it has no network and is removed after the coordinated backup. age provides authenticated file encryption; `SHA256SUMS` detects transfer errors but is not treated as a signature.

```sh
export COMPOSE_FILE=compose.yaml:compose.production.yaml
export COMPOSE_ENV_FILES=.env.production
export VITAE_BACKUP_RECIPIENTS_FILE=/run/secrets/vitae-backup-recipients
export BACKUP_ROOT=/srv/vitae/backups
sh scripts/operations/backup.sh
```

`COMPOSE_FILE` uses `:` on Linux/macOS and `;` on Windows; the scripts target Linux/POSIX release hosts. `COMPOSE_ENV_FILES` is comma-separated. These Docker Compose variables ensure every nested command uses the production overlay and its environment file; omitting them intentionally targets the development stack instead.

Copy the entire timestamped directory to encrypted operator-managed storage. Verify `SHA256SUMS` after transfer. Retain it for no more than 30 days. A backup is not verified until restored into a fresh isolated deployment and the primary smoke checks pass.

## Restore drill

Restore only into fresh, empty PostgreSQL and artifact volumes. The script deliberately refuses a database containing `users` or a nonempty artifact root; it never erases an existing deployment.

```sh
export COMPOSE_FILE=compose.yaml:compose.production.yaml
export COMPOSE_ENV_FILES=.env.production
export VITAE_BACKUP_IDENTITY_FILE=/run/secrets/vitae-backup-identity
sh scripts/operations/restore.sh /srv/vitae/backups/20260630T120000Z
```

The restore verifies encrypted-member hashes, authenticates and decrypts both age files to an access-restricted temporary directory, rejects unsafe archive paths, restores both members without preserving archive ownership, and starts only the deletion worker. User traffic remains stopped until pending/running deletion operations settle; then the app and other workers start.

The procedure was executed locally on 2026-07-01 with age 1.3.1 whose release checksum was verified before use. A fresh isolated restore recovered all 22 migrations, the reference-scale synthetic records, 2,103 document versions, 41 private/tombstone files, and five succeeded deletion receipts; readiness and the 2/2 deployment smoke suite passed. Temporary keys, decrypted files, backup output, and isolated volumes were then removed. This is local drill evidence, not a substitute for an operator's environment-specific RPO/RTO measurement.

Afterward, record elapsed time and verify:

1. `docker compose ps` reports healthy PostgreSQL and app services.
2. `/api/ready` returns success without document content in output or logs.
3. A content-free tombstone from the backup prevents its workspace from authenticating and is replayed to a completed deletion receipt.
4. A retained synthetic workspace can sign in, view evidence/document versions, create and download an export, and pass the deployment smoke test.
5. No decrypted working files remain and backup retention/expiry monitoring is active.

If replay does not settle, keep the app stopped, inspect content-free worker error codes, correct storage/database availability, and rerun the deletion worker. Do not remove a tombstone to recover access.

## Recovery and rollback boundary

Committed migrations are forward-only. Before an upgrade, restore-test the backup pair, deploy schema-compatible code, run migrations once, and wait for readiness. If validation fails, stop writes and restore the verified pair into fresh volumes with the prior compatible image. Never run an undocumented down migration or restore only one member of the pair.
