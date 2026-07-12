# Observability

The local MVP exposes health/readiness endpoints and launcher-owned local process
logs. It has no project telemetry exporter, hosted collector, OpenTelemetry
pipeline, analytics account, or remote support-bundle service. Telemetry is off
because no telemetry transport is implemented.

Application errors and maintenance callbacks use content-free categories. They
must not include names, emails, document/job text, prompts, model output,
evidence values, credential material, cookies/tokens, filenames, storage paths,
full URLs, or SQL values.

Database audit events are separate from process logs. They record allowlisted
security/product actions, opaque target identifiers, outcomes, correlations,
and bounded content-free metadata for operations such as credential lifecycle,
import/export/delete, fact approval/supersession, version creation, and denied
access. They are retained with the local workspace until aggregate workspace
deletion. They are deliberately excluded from portability exports, along with
identities, rate limits, transient jobs, credentials, and deletion receipts.

There is currently no automatic metrics dashboard, alerting integration, or
support-bundle generator. Operators diagnose the personal package with the
launcher `Status`/`Logs` commands, health/readiness responses, and documented
recovery procedures. Any future diagnostics export requires explicit user
preview and a new redaction/security review. See the [privacy model](../security/PRIVACY_MODEL.md)
and [ADR-0016](../adr/0016-observability-and-privacy.md).
