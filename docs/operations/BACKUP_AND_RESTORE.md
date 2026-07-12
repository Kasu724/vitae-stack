# Backup and restore

The complete physical dataset is one local data folder containing `vitae.sqlite`, `files/`, and `settings.env`. The `files/.deletions/` subdirectory is a content-free deletion-replay ledger. A database-only or files-only copy is incomplete.

## Backup

1. Stop Vitae Stack with `Stop Vitae Stack.cmd`.
2. Confirm the status reports stopped.
3. Copy the entire `%LOCALAPPDATA%\Vitae Stack` folder to an encrypted location you control.
4. Record the application version used to create the backup.

Stopping first ensures the SQLite database, write-ahead log, artifact files, and encryption key are a coordinated snapshot. Backups contain highly sensitive career data and optional provider credentials; the project does not upload, rotate, expire, or delete user-created copies.

## Restore

1. Stop Vitae Stack.
2. Preserve the current data folder separately; do not overwrite it in place.
3. Restore the backed-up folder as a unit to a fresh path.
4. If the preserved current folder contains `files/.deletions/`, copy that ledger directory into the restored folder before starting. This content-free ledger is the one narrow exception to the no-merge rule: it prevents a pre-deletion backup from reviving a workspace whose deletion was already confirmed. Never replace a newer deletion ledger with the older backup's copy.
5. Set `VITAE_DATA_DIR` to that path for the first verification start.
6. Confirm `/api/ready`, inspect representative career facts and versions, and create/download a test export.

If verification fails, stop the app and return to the preserved folder. Apart from carrying the deletion-replay ledger forward as described above, never merge two physical data folders. Use the in-product portability export/import workflow when moving selected logical data between installations. If a user deliberately omits or deletes that ledger, the application cannot detect that an older external copy predates a confirmed deletion.
