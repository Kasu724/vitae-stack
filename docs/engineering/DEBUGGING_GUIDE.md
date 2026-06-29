# Debugging guide

Start with a correlation/operation ID and content-free state: application version, deployment mode, route/job type, status/error code, duration, attempts, queue lease, provider alias/host class, parser/exporter/ruleset/task versions, and input hashes/counts—not the input itself.

## Implemented foundation diagnostics

- `/api/health` reports process liveness without touching dependencies.
- `/api/ready` reports only coarse database/migration readiness and returns 503 without leaking connection or SQL details.
- `pnpm db:check` validates migration metadata and forward-only artifact rules; `pnpm test:integration` uses an isolated PostgreSQL container for migration, role, constraint, transaction, and lease checks.

## Planned diagnostics

- Readiness expands with storage writability, encryption-key validity, and worker lease age as those components are implemented.
- Job inspector shows safe state transitions, deadlines, attempts, cancellation, and output object IDs to authorized owners.
- Provider capability test uses synthetic content; storage self-test writes/deletes a random probe; URL test uses a project-controlled public fixture only.
- Support bundle previews every included field and excludes environment values, SQL parameters, documents, URLs, prompts/output, and credentials.

For parser/provider/export crashes, reproduce with the smallest synthetic or securely retained consent-cleared fixture; never attach user files to public issues. For workspace leakage suspicion, stop affected access, preserve content-free audit/security evidence, rotate relevant secrets, use the private security process, and do not explore other users' data.

Do not enable blanket SQL/body/header logging, copy production databases locally, disable SSRF/TLS validation, expose trusted-local mode, or retry chargeable jobs without the idempotency key. Redaction failures are security incidents.
