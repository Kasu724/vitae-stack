# Secret Management

Secrets must not be committed, logged, bundled into releases, stored in browser storage, or copied into test fixtures.

## Rules

- Use environment variables or local encrypted credential storage for provider keys.
- Redact tokens, cookies, credentials, and authorization headers from errors and diagnostics.
- Keep `.env`, `.env.*`, key files, local databases, uploads, exports, and runtime folders out of Git.
- Rotate any credential that may have been exposed in an issue, log, artifact, or repository history.
- Deleting an unused provider configuration permanently removes its encrypted credential and task assignments. Configurations referenced by saved tailoring history remain deletion-blocked so provenance is not silently erased.
