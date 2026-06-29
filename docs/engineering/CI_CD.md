# CI/CD

GitHub Actions is the reference CI. M01 added a least-privilege workflow with actions pinned by commit for quality, browser, and container-smoke validation. M02 added isolated PostgreSQL migration/ownership tests, migration artifact checks, and Compose migration/readiness smoke coverage. Later milestones extend it with parser, export, AI-evaluation, and release jobs as those capabilities become executable.

## Planned workflows

- **PR:** metadata/docs checks; frozen install; format/lint/type/unit/contract; secret/SAST/dependency review; changed integration/E2E/a11y jobs.
- **Main:** full PostgreSQL integration/migration, E2E/a11y, parser/export fixtures, AI eval smoke, production/container build.
- **Scheduled:** full dependency/container scan, malicious corpus, broader evals, flaky detection, backup/restore rehearsal where safe.
- **Release:** clean build from tag, tests, SBOM, checksums/signatures/provenance, multi-architecture container publish, Compose smoke/upgrade/rollback, release notes.

Permissions default to `contents: read`; write, packages, attestations, or security-event permissions are per-job. Pull-request code from forks receives no secrets and cannot run on privileged self-hosted runners. Actions and base images are digest/commit pinned; caches are keyed to lockfile and cannot contain secrets/user data.

Artifacts have short retention and contain synthetic results only. Logs use redaction and never echo environment/configuration. Production deployment is not automatic in MVP; self-hosters pull signed releases and follow documented upgrade steps. Environments and manual approval apply if an official demo is later introduced.
