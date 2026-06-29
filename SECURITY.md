# Security policy

## Current state and supported versions

The repository contains plans only; there is no released application or supported runtime version. Once releases exist, the latest minor release will receive security fixes and the support table will be updated here.

## Reporting a vulnerability

Do not disclose vulnerabilities or personal career data in a public issue. Use GitHub's **Report a vulnerability** private advisory flow for this repository. If that feature is unavailable, open a content-free issue asking a maintainer to establish a private channel. Include affected version/commit, impact, reproduction, prerequisites, and suggested mitigation; redact tokens and real documents.

Maintainers target acknowledgement within 3 business days, triage within 7, and status updates at least every 14 days. These are response targets, not guarantees. We will coordinate disclosure after a fix or mitigation is available. Do not test against systems or accounts you do not own.

## Security expectations

See [security architecture](docs/security/SECURITY_ARCHITECTURE.md), [threat model](docs/security/THREAT_MODEL.md), and [secret management](docs/security/SECRET_MANAGEMENT.md). Never commit credentials or upload real user documents to issues, tests, demos, or AI evaluation datasets.
