# Security Architecture

Vitae Stack is designed as a local-first personal application. The supported personal package binds to loopback, stores data in the user's local profile, and avoids required hosted services.

## Boundaries

- Uploaded files, generated documents, SQLite data, and settings remain on the user's machine by default.
- Provider credentials are optional and should be stored only in local configuration or encrypted records.
- Logs must not contain resume content, credentials, provider requests, or model output.
- File parsing and export paths must reject unsafe formats, oversized inputs, and executable content.

## Release Controls

Release review checks dependencies, notices, checksums, package contents, loopback configuration, and fixable high or critical advisories.
