# Release process

Vitae Stack uses semantic versioning before and after `1.0`, with explicit migration/archive/ruleset/task-schema versions. Pre-1.0 minor releases may contain product API changes but must provide data migration/recovery notes.

## Checklist

1. Freeze scope; close or explicitly defer milestone criteria and update traceability/risk/open questions.
2. Run all release quality gates, full eval/security/accessibility/performance suites, clean Compose install, upgrade, backup/restore, and rollback rehearsal.
3. Review migrations for forward compatibility, backup prerequisite, lock/runtime impact, and recovery. Test deletion tombstone replay after restore.
4. Review dependency licenses/advisories; generate SBOM, notices, checksums, signatures, and build provenance.
5. Update changelog, support/security version table, deployment/upgrade notes, known limitations, ruleset/prompt/provider compatibility, and artifact schema.
6. Create signed annotated tag from protected main; build immutable source/container artifacts in CI; publish only after verification.
7. Monitor content-free health/error metrics and security channel; document rollback threshold.

Rollback uses the prior compatible app image while forward-compatible migrations permit it. Destructive migrations use expand/migrate/contract across releases and restore from verified backup if rollback cannot preserve data. Never silently down-migrate user data.

The first MVP release requires M01–M22 completion and [MVP release-ready definition](../product/MVP_SCOPE.md). There is currently no release artifact.

## Initial release mechanics

1. Set `package.json` to the intended semantic version, update `CHANGELOG.md`, and add `docs/releases/<version>.md`.
2. Complete M21 evidence, including the manual accessibility matrix and timed backup/restore plus deletion replay. Do not tag around an unavailable gate.
3. From protected `main`, create and locally verify a signed annotated tag, for example `git tag -s v0.1.0 -m "Vitae Stack 0.1.0"`, then push that tag.
4. The tag workflow requires an annotated tag and exact package-version match. It creates a draft release only after the full gate and all five image jobs pass.
5. Independently verify `SHA256SUMS`, `gh attestation verify` for release assets, OCI image provenance/SBOM, image scan results, source-archive reproducibility, and production-overlay clean install.
6. A maintainer reviews the generated draft, attaches the signed-tag/manual/recovery evidence, and publishes it. No workflow deploys a hosted service.

The release workflow is configuration in this repository; it has not run remotely and no GitHub package, tag, or release is claimed here.
