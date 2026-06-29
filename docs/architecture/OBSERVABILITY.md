# Observability

Observability is local, minimal, structured, and content-free by default. The application emits JSON logs, health/readiness, bounded metrics, and OpenTelemetry-compatible traces only when explicitly configured. No hosted collector is required; telemetry is off by default.

Allowed fields: timestamp, severity, service/version, event name, route template, status class, duration bucket, opaque correlation/job/workspace hash, provider/model alias, token/byte counts, retry reason category, and rule IDs. Forbidden fields: names, emails, document/job text, prompts, model output, evidence values, URLs with path/query, filenames, cookies, auth headers, provider keys, secret ciphertext, IP addresses beyond short-lived security counters, and database statements with values.

Audit events are separate from debug logs and record security-relevant actions/outcomes without content: login, credential lifecycle, import/export/delete, fact approval/supersession, version creation, provider transmission consent, and authorization denial. Audit retention defaults to 90 days and is included in data export where it concerns the user.

Metrics include request/job latency, queue depth/age, parser/provider/export failure class, job attempts, ATS duration, artifact bytes, and rate-limit events. Labels are low-cardinality and never user/object IDs. Alerts target stuck deletion, queue age, repeated auth failures, storage/database health, error-rate budget, and expiring backups where operator tooling integrates.

Support bundles require user preview, redact configuration and identifiers, and never include documents/secrets. See [privacy model](../security/PRIVACY_MODEL.md) and [ADR-0016](../adr/0016-observability-and-privacy.md).
