# CI/CD

GitHub Actions is the reference CI. The main workflow has least-privilege, commit-pinned quality, PostgreSQL integration, browser, parser, export, ATS, portability/deletion, AI-evaluation, production-build, and correctly ordered migrate-before-readiness Compose smoke jobs. M19 adds a separate commit-pinned security workflow: CodeQL 4.36.0 with extended JavaScript/TypeScript queries, a current Buildx production image build, a Grype high/critical fixed-vulnerability gate, and a Syft SPDX JSON SBOM retained for 14 days. These workflows exist in the repository but have not been executed remotely in this worktree.

## Current and release workflows

- **PR/main (implemented):** frozen install; format/lint/type/unit/contract; security and dependency checks; full PostgreSQL integration; parser/export/ATS/portability/deletion fixtures; AI eval smoke; production build; E2E/a11y; Compose smoke; CodeQL; image scan; SBOM.
- **Scheduled:** full dependency/container scan, malicious corpus, broader evals, flaky detection, backup/restore rehearsal where safe.
- **Release (authored, not remotely activated):** an annotated version-matching tag runs every automated gate, the disposable primary journey, authenticated reference-size load, clean Compose smoke, five multi-architecture image builds/scans with OCI SBOM/provenance, a reproducible source archive, SPDX assets, SHA-256 checksums, GitHub Sigstore attestations, and a draft—not automatic public—GitHub release. Maintainers publish only after manual AT and recovery evidence is attached.

Permissions default to `contents: read`; write, packages, attestations, or security-event permissions are per-job. Pull-request code from forks receives no secrets and cannot run on privileged self-hosted runners. Actions and base images are digest/commit pinned; caches are keyed to lockfile and cannot contain secrets/user data. Release images use the tag version and are also consumed by digest in a locked operator deployment when the release is promoted.

Artifacts have short retention and contain synthetic results only. Logs use redaction and never echo environment/configuration. Production deployment is not automatic in MVP; self-hosters pull signed releases and follow documented upgrade steps. Environments and manual approval apply if an official demo is later introduced.
