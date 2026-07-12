# Data retention and deletion

Active career data, document versions, approved evidence, jobs, and settings remain until the user changes or deletes them. Failed temporary operations and expiring export artifacts have bounded cleanup periods documented by their feature.

Source-byte deletion removes the opaque file and extracted source text. Approved facts may remain only after explicit user choice and display `source unavailable`. Fact/entry deletion previews dependent claims, versions, matches, and artifacts before applying the documented cascade.

“Delete all local data” freezes the current workspace, writes a content-free retry tombstone before processing, deletes managed artifacts/queues, erases the relational workspace aggregate in one deferred-foreign-key SQLite transaction, removes the local principal when no longer referenced, and retains only the content-free operation receipt/tombstone needed to prevent interrupted deletion from resurrecting data. Startup reconciliation runs before requests, and a recurring local maintenance loop retries failed or interrupted work with backoff. The next visit may create a new empty local workspace.

The application controls only its configured data folder. It cannot discover or erase portability exports, downloaded documents, manual backups, synchronized copies, or filesystem snapshots the user created elsewhere. The UI states this limit before deletion.

The application creates no deletion backup and has no operator backup service. The receipt's backup-expiry field is set to the request time, representing zero application-managed backup retention. External copies remain under user control.

For physical backup/restore, stop the app and copy/restore the complete folder containing SQLite, files, tombstones, and `settings.env`. A restore must carry the newest `files/.deletions/` ledger forward; otherwise an older user-controlled copy can revive data the application can no longer recognize as deleted. Logical portability archives omit secret plaintext. See [backup and restore](../operations/BACKUP_AND_RESTORE.md).
