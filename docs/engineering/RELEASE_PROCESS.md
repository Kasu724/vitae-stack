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
