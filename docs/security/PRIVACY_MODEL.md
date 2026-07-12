# Privacy model

## Data classes

- **Restricted:** source documents, career facts, job text, generated content, exports, provider credentials, and the deletion ledger.
- **Confidential metadata:** names/emails, object relationships, provider endpoint paths, audit events, usage counts.
- **Operational:** version, rule/task IDs, aggregate durations/errors, queue depth.
- **Public:** repository documentation and synthetic fixtures.

The one local workspace is the application data boundary; the user controls the local installation and its physical copies. A configured remote model provider is an external processor chosen by the user. Vitae Stack minimizes task context and shows destination/data classes before sending; it cannot make contractual claims for that provider.

## Principles and behavior

Collect only data required for a user-selected workflow. Keep telemetry disabled by default. Do not use imported/generated content to train project models. Do not include restricted content in logs, analytics, crash reports, issue templates, fixtures, or support bundles. Do not expose raw storage URLs.

Users can use all deterministic/manual capabilities without a remote AI provider, choose Ollama, export a versioned archive, remove source bytes while retaining approved facts, or permanently delete records/workspace. Secrets are excluded from portability exports; configurations identify the destination without key material.

Default retention is documented in [data lifecycle](../architecture/DATA_LIFECYCLE.md). User-visible privacy notices state purpose, destination, retention, and deletion limitations for external copies/providers. New telemetry, provider tools, or data sharing requires opt-in product review, threat-model update, and an architecture decision.
