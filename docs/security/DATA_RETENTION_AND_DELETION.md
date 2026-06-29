# Data retention and deletion

## Defaults

| Data                                         | Default retention                      |
| -------------------------------------------- | -------------------------------------- |
| Career/job/document data and saved sources   | Until user deletes/workspace deletion  |
| Failed/temporary uploads and fetch bodies    | ≤24 hours                              |
| Unsaved export artifacts                     | 24 hours                               |
| Completed unreferenced operation/job details | 30 days                                |
| Content-free audit events                    | 90 days                                |
| Encrypted operator backups                   | ≤30 days, operator-documented schedule |
| Rate-limit security buckets                  | ≤7 days or shorter rolling window      |

Operators may shorten retention. Longer retention requires visible configuration and privacy review. External model-provider retention is outside project control and must be disclosed before transmission.

## User actions

Source-binary deletion removes bytes/previews while retaining explicitly approved facts only after the user confirms that locators will become unavailable. Fact withdrawal excludes future use but preserves historical links. Fact hard deletion shows dependent current/historical claims, versions, and artifacts and requires choosing deletion of affected dependents or cancellation; dangling support is forbidden.

Workspace deletion requires recent authentication (or local console confirmation in trusted-local), typed phrase, and an idempotent operation. It blocks new writes, deletes artifact keys and relational aggregates, verifies absence, and emits a receipt with operation ID/times/counts—not content. Active systems complete within 24 hours. Backups age out within 30 days and are not selectively rewritten unless the documented backup system supports safe deletion; restoring a backup must replay deletion tombstones before service opens.

Failure leaves an auditable retryable operation and alerts the operator. The UI reports active completion and latest backup-expiry date separately. Deletion tests cover retries, partial storage outage, concurrent writes, restored backups, orphan scanning, and cross-workspace safety.
