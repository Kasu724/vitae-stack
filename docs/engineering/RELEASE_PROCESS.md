# Release process

Vitae Stack uses semantic versions with explicit SQLite migration, archive, ATS-ruleset, and AI-task schema versions.

## Checklist

1. Freeze scope and update requirements, traceability, risks, readiness, changelog, and release notes.
2. Run every command in [quality gates](QUALITY_GATES.md) on Node 24.18.0/pnpm 11.9.0.
3. Review forward SQLite migrations and rehearse a stopped full-data-folder backup, upgrade, verification, and restore.
4. Build the Windows package with `scripts/personal/package.ps1`; verify its SHA-256 record and inspect it for user data, secrets, caches, and unsupported deployment files.
5. Extract to a clean directory on a host without a separately installed Node/database/container runtime. Start against an isolated `VITAE_DATA_DIR`, verify ready/health and the primary browser path, stop, restart, and prove persistence.
6. Review dependency licenses/advisories, notices, source publication links, SBOM/provenance, loopback configuration, logs, and fixable critical/high findings.
7. Create and verify an annotated version-matching tag. The pinned release workflow repeats the full gate, builds the Windows ZIP/source archive, creates checksums/attestations, and opens a draft release.
8. A maintainer reviews and publishes the draft. No workflow deploys a hosted service.

Public tagging/signing/publication uses maintainer GitHub/signing access, but that is not required to build or run the local application and is not a product blocker.

## Rollback

Application binaries are separate from user data. Before upgrade, stop the app and copy the full data folder. If the new binary fails before an incompatible migration, replace it with the prior release. If a migration prevents binary rollback, stop and restore the coordinated pre-upgrade data folder; never down-migrate or merge physical SQLite/files snapshots in place.

No tag, hosted release, signature, or remote workflow run is claimed merely because local artifacts exist.
