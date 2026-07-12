# Requirements traceability

This matrix connects every normative product requirement and acceptance
criterion to its delivery milestone and primary verification evidence. A path
identifies the maintained automated suite; a command identifies a repository
gate; “manual” identifies release evidence that cannot be inferred from a test
file. A mapping is not a claim that the evidence passed in the current run.

## Current scope

- Local-only, single-user operation with no application account.
- User-controlled local storage, backup/restore, portability, and deletion.
- Evidence-grounded generated career content and fail-closed final export.
- Explainable ATS estimate rather than a hiring-outcome prediction.
- Safe file/URL ingestion and bounded document rendering.
- Optional model providers behind explicit configuration and transmission
  previews.

## Product requirements

| Requirement | Milestone(s)            | Primary automated/manual evidence                                                                                                                |
| ----------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| PR-001      | M04, M18                | `tests/integration/career.integration.test.ts`; `tests/integration/portability-deletion.integration.test.ts`; `tests/e2e/career-bank.spec.ts`    |
| PR-002      | M04                     | `tests/unit/career-domain.test.ts`; `tests/unit/career-form-validation.test.ts`; `tests/integration/career.integration.test.ts`                  |
| PR-003      | M04, M18                | `tests/integration/career.integration.test.ts`; `tests/deletion/workspace-deletion-recovery.test.ts`                                             |
| PR-004      | M05                     | `tests/integration/documents.integration.test.ts`; `tests/e2e/document-library.spec.ts`                                                          |
| PR-005      | M05, M15                | `tests/integration/documents.integration.test.ts`; `tests/integration/requirements.integration.test.ts`                                          |
| PR-006      | M06                     | `pnpm test:parsers`; `tests/integration/sources.integration.test.ts`; file-upload security fixtures                                              |
| PR-007      | M07                     | `tests/integration/extraction.integration.test.ts`; `tests/e2e/extraction-review.spec.ts`                                                        |
| PR-008      | M08, M09                | `tests/integration/jobs.integration.test.ts`; `tests/e2e/job-ingestion.spec.ts`; `pnpm test:ssrf`                                                |
| PR-009      | M09                     | `pnpm test:ssrf`; `tests/security/url-fetching.security.test.ts`                                                                                 |
| PR-010      | M10                     | `tests/integration/requirements.integration.test.ts`; `pnpm test:evals --task=AI-02`; `tests/e2e/job-ingestion.spec.ts`                          |
| PR-011      | M11                     | `tests/unit/matching-domain.test.ts`; `tests/integration/requirements.integration.test.ts`                                                       |
| PR-012      | M13, M14                | `tests/unit/resume-tailoring-service.test.ts`; `tests/unit/cover-letter-tailoring-service.test.ts`; `tests/e2e/resume-tailoring.spec.ts`         |
| PR-013      | M13                     | `tests/unit/resume-tailoring-service.test.ts`; `tests/integration/requirements.integration.test.ts`; `pnpm test:evals --task=AI-05,AI-06`        |
| PR-014      | M14                     | `tests/unit/cover-letter-tailoring-service.test.ts`; `tests/integration/requirements.integration.test.ts`; `pnpm test:evals --task=AI-07,AI-08`  |
| PR-015      | M13–M15                 | `tests/unit/document-grounding.test.ts`; `tests/integration/documents.integration.test.ts`; `tests/integration/requirements.integration.test.ts` |
| PR-016      | M13, M15, M17           | grounding/tailoring unit regressions; `tests/integration/exports.integration.test.ts`                                                            |
| PR-017      | M15                     | `tests/integration/requirements.integration.test.ts`; `tests/e2e/resume-tailoring.spec.ts`                                                       |
| PR-018      | M05, M15                | `tests/unit/document-editor.test.tsx`; `tests/integration/documents.integration.test.ts`; `tests/e2e/document-library.spec.ts`                   |
| PR-019      | M16                     | `pnpm test:ats`; `tests/integration/ats.integration.test.ts`; `tests/e2e/primary-journey.spec.ts`                                                |
| PR-020      | M17                     | `pnpm test:exports`; `tests/integration/exports.integration.test.ts`; `pnpm test:performance`                                                    |
| PR-021      | M18                     | `pnpm test:portability`; `tests/integration/portability-deletion.integration.test.ts`                                                            |
| PR-022      | M12                     | `tests/integration/providers.integration.test.ts`; `tests/contract/provider-adapters.contract.test.ts`; provider settings E2E                    |
| PR-023      | M21, M22                | `tests/unit/personal-release.test.ts`; `pnpm test:smoke`; `pnpm test:personal`; extracted-package restart/persistence drill                      |
| PR-024      | M10, M12–M14            | provider request security tests; rendered AI-02/tailoring transmission-preview inspection; `pnpm test:evals --smoke`                             |
| PR-025      | M18                     | `pnpm test:deletion`; `tests/deletion/workspace-deletion-recovery.test.ts`; restore-ledger drill                                                 |
| PR-026      | M03, M19                | `tests/security/headers.security.test.ts`; cross-workspace integration tests; `tests/personal/no-account.spec.ts`                                |
| PR-027      | M19                     | `pnpm test:security`; `pnpm test:ssrf`; `pnpm security:check`; abuse-case review                                                                 |
| PR-028      | M02, M05, M09, M18, M21 | database/concurrency integration tests; editor recovery; fetch/deletion recovery; package restart drill                                          |
| PR-029      | M20, M21                | `pnpm test:performance`; production-target `pnpm test:load`; rendered viewport/reflow matrix                                                     |

## Acceptance criteria

| Criterion | Milestone(s)  | Primary automated/manual evidence                                                        |
| --------- | ------------- | ---------------------------------------------------------------------------------------- |
| AC-001    | M03, M19      | two-workspace cases across integration suites; `tests/security/headers.security.test.ts` |
| AC-002    | M04, M07      | career/extraction integration approval and eligibility assertions                        |
| AC-003    | M04           | `tests/integration/career.integration.test.ts` supersession/audit assertions             |
| AC-004    | M06           | `pnpm test:parsers`; malicious upload/security corpus                                    |
| AC-005    | M07           | `tests/integration/extraction.integration.test.ts`; extraction review E2E                |
| AC-006    | M08, M09      | jobs integration; `pnpm test:ssrf`; URL-fetch security tests                             |
| AC-007    | M10, M12      | structured-task runner unit/contract tests; AI-02 eval/integration fallback              |
| AC-008    | M11           | matching engine and requirements integration matrix/gap assertions                       |
| AC-009    | M13, M14      | tailoring service unit payload tests; log/secret scan                                    |
| AC-010    | M13–M15       | grounding adversarial unit corpus; requirements/documents integration regressions        |
| AC-011    | M15           | tailoring suggestion persistence/review integration; stale review E2E                    |
| AC-012    | M13–M15       | tailoring lock validation integration and blocked-suggestion assertions                  |
| AC-013    | M13–M15       | tailoring idempotency/version-count integration tests                                    |
| AC-014    | M05, M15      | documents integration claim invalidation/remediation tests; editor UI inspection         |
| AC-015    | M17           | exports integration binary blocking and draft-manifest tests                             |
| AC-016    | M16           | ATS deterministic reuse/invariance tests and integration input pinning                   |
| AC-017    | M16           | ATS engine/report UI tests and rendered report inspection                                |
| AC-018    | M05           | document compare/restore copy-forward integration tests                                  |
| AC-019    | M17           | `pnpm test:exports`; PDF/DOCX parse-back; rendered PDF visual inspection                 |
| AC-020    | M18           | portability schema/unit tests; semantic round-trip/no-write integration tests            |
| AC-021    | M18           | deletion domain/recovery tests; frozen-write/delete database tests; restore drill        |
| AC-022    | M12           | provider encryption/integration tests; credential-envelope unit tests; secret scan       |
| AC-023    | M03, M19, M22 | header/proxy security tests; launcher/package contracts; real listener/Host probe        |
| AC-024    | M19           | security, SSRF, deletion, grounding, parser, and dependency gates                        |
| AC-025    | M21, M22      | extracted Windows package smoke/personal/restart/persistence and ZIP inspection          |
| AC-026    | M20, M21      | performance suite; production load smoke; rendered interaction/reflow observations       |
| AC-027    | M21           | this complete matrix; `pnpm docs:check`; full audit command ledger                       |

## Evidence expectations

Every behavior change identifies the affected workflow, the test coverage added
or updated, and any release or migration note needed by users. Commands are
reported as passing only when run in the current environment.

## Portable package startup detail

- **Workflow:** PR-023 and AC-025 require the extracted Windows package to apply
  its bundled SQLite migrations and start without source-checkout files or
  installed runtime dependencies.
- **Automated evidence:** `tests/unit/personal-release.test.ts` checks both
  migration files and launcher contracts. Windows package jobs in
  `.github/workflows/ci.yml` and `.github/workflows/release.yml` launch from the
  extracted bundle before smoke/personal tests.
- **Release impact:** Rebuild and re-exercise the portable ZIP after launcher,
  migration, or standalone-output changes. Migration-only changes require an
  upgrade/restart persistence drill against a copy of prior-version data.
