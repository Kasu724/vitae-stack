# 0.1.0 release-readiness record

**Current disposition (2026-07-01): locally release-candidate ready, not publishable.** M01–M20 and the locally executable M21 gates pass. Publication remains blocked by the external manual assistive-technology matrix and maintainer-controlled remote workflow/artifact verification. No release artifact exists.

## Automated evidence

| Gate                                                       | Required evidence                                                     | Current result                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format, types, lint, docs, notices, static security        | supported Node 24, exact commands from `QUALITY_GATES.md`             | Pass under Node 24.14.0 with pnpm 11.9.0; 700-package notices are current. Tag workflow repeats on pinned Node 24.17.0.                                                                                                                  |
| Unit/contract/evals/parser/ATS/export/portability/deletion | full non-skipped suites and synthetic fixtures                        | Node 24: unit 20/60, contract 1/5, eval 2/4, parser 1/5, security 5/52, ATS 1/6, export 1/4, portability 1/2, deletion 1/2 pass.                                                                                                         |
| PostgreSQL integration and migrations                      | clean 0000→0021 migration, isolation, round trips, deletion replay    | Pass: 22 migrations from empty volumes; 12 files/50 integration tests; deletion replay and runtime DDL/ownership controls verified.                                                                                                      |
| Browser E2E/accessibility/smoke                            | primary journey plus focused Chromium suites                          | Pass: 12/12 E2E, 11/11 axe/accessibility, and 2/2 deployment smoke tests; external manual AT rows remain below.                                                                                                                          |
| Reference performance                                      | 1,000 facts, 100×20 document versions, 50 jobs; every budget measured | Pass locally: authenticated reads at concurrency 20 had p95 dashboard 473 ms, career 344 ms, documents 409 ms; ATS 6 ms, PDF 936 ms, DOCX 66 ms. Career load is end-to-end and therefore does not isolate its 300 ms server-time budget. |
| Production build and Compose                               | clean build, migrate-before-ready, worker restart, no dev credentials | Pass: Next.js 16.2.9 production build, fresh-volume migration, healthy non-root production services, cold parser/fetch/deletion workers, and external smoke.                                                                             |
| Supply chain                                               | audit, CodeQL, image scan, SPDX, notices, source/image provenance     | Production audit reports no known vulnerabilities; secret/action/base-image pin checks pass. Remote scans/attestations remain pending.                                                                                                   |

## Required manual and recovery evidence

- Complete every row in [accessibility validation](../design/ACCESSIBILITY_VALIDATION.md), including keyboard, 200%/400% zoom, Windows High Contrast, NVDA/Firefox+Chrome, VoiceOver/Safari, and PDF/DOCX assistive-technology checks. Record versions, reviewer, date, result, and defect reference.
- The 2026-07-01 validation host is Windows and has no NVDA, Safari/VoiceOver, Word, or LibreOffice installation. Those named-platform rows cannot be executed in this environment; they require a Windows AT host and an Apple Safari/VoiceOver host before publication.
- Backup/restore passed on 2026-07-01 using a paired age-encrypted database/artifact backup restored into fresh isolated volumes. Verification found all 22 migrations, retained synthetic data and artifacts, five succeeded deletion receipts, healthy readiness, and passing smoke; decrypted working material and the isolated drill volumes were removed afterward.
- Parser crash/timeout and cold-start recovery, provider refusal/timeout, URL-fetch failure, worker restart, stale suggestion, duplicate request, deletion replay, and export-integrity failure paths have automated coverage. Database/storage interruption remains covered by safe failure and restore procedures rather than a destructive production-host drill.
- Review all critical/high risks, dependency licenses, AGPL/source offer, current advisories, secrets/history scan, logs, migration locks, and the production environment file.

## Promotion decision

Promotion requires completion of the external manual accessibility rows, no blocker/high accessibility or exploitable critical/high security issue, no release-blocking marker, and no expired exception. A maintainer then:

1. verifies clean-checkout reproducibility and the complete primary journey;
2. signs and pushes annotated `v0.1.0` from protected `main`;
3. verifies the workflow-generated checksums, image digest records, SPDX files, BuildKit provenance/SBOM, GitHub attestations, and draft release;
4. installs the digest-pinned production overlay on a clean host and repeats smoke plus restore checks; and
5. publishes the draft only after attaching the manual/recovery evidence.

If any step fails, leave the draft unpublished, correct the owning milestone, and rerun from a new clean candidate. Do not retag a published version or waive provenance, deletion, isolation, accessibility, or migration failures.

The current worktree has not been pushed and no protected remote workflow, tag, registry publication, attestation, or GitHub draft release was authorized in this local validation. These are intentionally not simulated with local files.
