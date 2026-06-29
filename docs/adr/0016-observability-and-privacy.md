# ADR-0016: Use content-free local observability by default

- **Status:** Accepted
- **Date:** 2026-06-28

## Context

Operators need diagnosis and capacity/security signals, but logs/traces can become a second copy of highly sensitive career data and secrets.

## Decision

Emit allowlisted structured JSON logs, low-cardinality metrics, health/readiness, and separate content-free audit events. Telemetry export/OpenTelemetry is opt-in and endpoint-neutral. Never log body/document/job/prompt/output, full URL, email, token, key, SQL values, or storage path. Retain audit 90 days by default.

## Alternatives considered

Verbose request/body logging improves short-term debugging but is unacceptable. Mandatory hosted analytics violates self-host/privacy goals. No observability makes deletion/provider/parser failures unsafe to operate.

## Consequences

Most issues can be correlated via opaque IDs, versions, counts, and error classes; content-specific debugging requires consent-cleared minimal reproduction. Field allowlists and redaction tests need maintenance.

## Security and privacy implications

Minimizes secondary data leakage and vendor transfer. Operator/root can still access primary stores. Support bundles require preview and never include raw configuration/content.

## Revisit conditions

Regulatory/operator needs require different audit retention, a privacy-preserving crash-report design is proposed, or diagnostics prove insufficient with measured incidents.
