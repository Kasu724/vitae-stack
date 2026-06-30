# MVP implementation plan

**Status:** In progress. M01–M05 were implemented and locally validated on 2026-06-29. M06–M08 are implemented locally but await PostgreSQL, browser, and Compose validation because the local Docker engine is unavailable. The reference GitHub Actions workflow exists but has not been executed remotely because no repository push is part of this work. Each milestone remains independently demoable and must preserve prior invariants.

## M01 — Repository and development foundation

**Implementation status:** Complete in the local repository. Static, unit, documentation, security, and build gates passed under the pinned Node 24.17.0 container; browser E2E and axe checks passed; the non-root/read-only Compose deployment passed health and external smoke checks. Remote GitHub Actions execution remains an external verification step and must not be claimed as passing.

- **Objective:** Establish pinned Node/pnpm/Next.js/TypeScript tooling, modular boundaries, format/lint/type/unit/build/docs commands, synthetic fixture policy, and minimal Compose PostgreSQL service.
- **User-visible outcome:** A documented local landing/status page can run; it explicitly says features are not yet available.
- **Scope:** manifests/configuration, strict compiler, Tailwind tokens, test runner, health shell, CI PR checks, developer setup.
- **Non-scope:** database domain schema, auth, product screens, AI.
- **Prerequisites/dependencies:** accepted docs/ADRs; none earlier.
- **Likely files/subsystems:** root config, `src/app`, module boundary config, `tests`, Compose, `.github/workflows`.
- **Data-model impact:** none beyond a connection probe.
- **Security:** pinned dependencies/actions/images, secret-safe env validation, nonroot container baseline.
- **Accessibility:** semantic shell, skip link, focus and color tokens.
- **Required tests:** config/env, health, example unit, docs links, axe smoke, clean install/build.
- **Validation commands:** `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm docs:check && pnpm build`; `docker compose config`.
- **Completion criteria:** commands exist/pass on clean supported hosts and CI; no implementation claim beyond shell; exact versions documented.
- **Rollback/recovery:** revert foundation commit; no user data. **Docs:** update setup, structure, CI, AGENTS planned-command labels.

## M02 — Database and migrations

**Implementation status:** Complete in the local repository. Three reviewed forward migrations establish identity/workspace/profile, operation/audit, composite ownership, restricted runtime grants, and readiness. Tests cover empty/current/previous migration paths, rollback, cascades, runtime DDL denial, cross-workspace rejection, and concurrent leasing. The clean Compose migrate/readiness flow passed locally; remote CI remains unverified.

- **Objective:** Implement Drizzle/PostgreSQL foundation, ownership columns/constraints, migration runner, job/audit primitives, and migration test harness.
- **User-visible outcome:** none beyond readiness reporting database/migration state.
- **Scope:** initial identity/workspace/profile skeleton, migration roles, transaction helpers, seed only synthetic data.
- **Non-scope:** auth behavior and career/document UI.
- **Prerequisites/dependencies:** M01.
- **Likely files/subsystems:** `db/schema`, `db/migrations`, repositories, integration tests.
- **Data-model impact:** User/auth-compatible placeholders, Workspace, Membership, CareerProfile, JobOperation, AuditEvent base.
- **Security:** separate runtime/migration roles, parameterization, workspace composite-key pattern, backup-before-migrate policy.
- **Accessibility:** readiness errors are textual/actionable.
- **Required tests:** empty/current/previous migration, drift, constraints, transaction rollback, job lease concurrency, cross-workspace FK rejection.
- **Validation commands:** M01 gates plus `pnpm db:check && pnpm test:integration`.
- **Completion criteria:** clean and upgrade migrations pass; schema diagram/constraints match docs; recovery drill documented.
- **Rollback/recovery:** restore verified pre-migration dump or prior compatible image; no destructive down migration. **Docs:** data model/deployment/debugging.

## M03 — Authentication and workspace isolation

**Implementation status:** Complete in the local repository. Better Auth password mode, closed registration, one-time hidden/mounted-secret bootstrap, database sessions/rate limits, same-origin enforcement, generic errors, sign-in/out UI, server-resolved principals, recent-auth and workspace policy, trusted-local guards, reset, and in-place claim are implemented. Unit, PostgreSQL integration, browser E2E, and axe tests cover the security/accessibility criteria; remote CI remains unverified.

- **Objective:** Add password mode, bootstrap admin, secure sessions, closed registration, trusted-local startup guard, reauth, and centralized workspace policy.
- **User-visible outcome:** secure sign-in/sign-out/account bootstrap and safe personal loopback mode.
- **Scope:** Better Auth integration, account/session pages, rate limit, CSRF, generic auth errors, per-request principal.
- **Non-scope:** public signup, OIDC/social, shared workspace roles, email-required reset.
- **Prerequisites/dependencies:** M02.
- **Likely files/subsystems:** auth module/routes/UI, middleware/policy, session tables, security tests.
- **Data-model impact:** auth-owned user/account/session/verification tables and membership enforcement.
- **Security:** hash benchmarking, cookie flags/rotation/revocation, enumeration/CSRF/fixation/brute-force tests, recent reauth.
- **Accessibility:** labeled forms, error summary, focus, password-manager support, 320px reflow.
- **Required tests:** auth lifecycle, session expiry/revoke, two-workspace IDOR matrix, trusted-local unsafe-start failures.
- **Validation commands:** M02 gates plus `pnpm test:contract && pnpm test:e2e && pnpm security:check`.
- **Completion criteria:** AC-001/AC-023 pass; every protected sample resource scopes server-side; operator reset documented.
- **Rollback/recovery:** disable registrations, revoke sessions, restore auth tables; trusted-local conversion backed up. **Docs:** auth/security/deployment.

## M04 — Career Information Bank

**Implementation status:** Complete in the local repository. Migration 0004 adds structured entries, profile settings, reusable skills, proposals, immutable evidence, and composite workspace ownership. The UI supports all MVP entry types, partial dates, typed metric proposals, explicit fact review, correction/withdrawal, provenance inspection, search, duplicate indication, archive/restore, and counted permanent deletion. Unit, PostgreSQL integration, browser E2E, 320 px reflow, and automated WCAG A/AA checks pass locally; remote CI remains unverified.

- **Objective:** Implement structured entries, skills, goals/preferences, fact proposals, approval/supersede/withdraw/delete lifecycle, search/filter.
- **User-visible outcome:** users can build and manage verified career data manually.
- **Scope:** all MVP entry types, typed metrics/dates, provenance inspector, duplicate/conflict indicators.
- **Non-scope:** document extraction and AI.
- **Prerequisites/dependencies:** M03.
- **Likely files/subsystems:** career domain/repositories/API/UI, schemas, search.
- **Data-model impact:** CareerEntry, EvidenceFact, Skill, CareerEntrySkill, proposal and lifecycle indexes.
- **Security:** workspace scope, sensitive search, audit without values, dependent delete authorization.
- **Accessibility:** keyboard list/editor, status not color-only, bulk confirmation, date labels.
- **Required tests:** lifecycle/state/property tests, typed validation, search isolation, concurrency, AC-002/003.
- **Validation commands:** all core gates plus `pnpm test:integration && pnpm test:e2e && pnpm test:a11y`.
- **Completion criteria:** every entry type is create/read/update/archive; immutable facts cannot mutate; dependency preview works.
- **Rollback/recovery:** additive migration rollback via prior image; export facts before destructive recovery. **Docs:** CIB UX/data lifecycle/traceability.

## M05 — Document library and versioning

**Implementation status:** Complete in the local repository. Migration 0005 adds resumes/cover letters, immutable full snapshots, section projections, optimistic drafts, claim/evidence primitives, and locks. The accessible structured editor autosaves drafts, creates idempotent versions, compares structure/text/claims/provenance, archives documents, and restores by copy-forward. Database triggers prevent history mutation. Unit, PostgreSQL integration, E2E, XSS/plain-text, 320 px reflow, and automated WCAG checks pass locally; remote CI remains unverified.

- **Objective:** Implement logical resumes/letters, typed canonical schema, drafts, immutable versions, compare/restore, locks and claim primitives.
- **User-visible outcome:** users create, edit metadata, save, compare, restore, archive, and select document versions.
- **Scope:** safe basic structured editor, optimistic concurrency, lineage, autosave draft.
- **Non-scope:** import, AI suggestions, rich export.
- **Prerequisites/dependencies:** M04 (facts), M03.
- **Likely files/subsystems:** documents domain/API/editor shell/version UI.
- **Data-model impact:** Document, DocumentVersion, DocumentSection projection, GeneratedClaim, ClaimEvidence, draft/lock.
- **Security:** restricted node schema, escaping, ownership/download absence, conflict integrity.
- **Accessibility:** structured editing keyboard/semantics, autosave announcements, version diff reading order.
- **Required tests:** schema/migration, immutable snapshots, concurrent draft, restore copy-forward, XSS/paste, AC-018.
- **Validation commands:** core/integration/contract/E2E/a11y/build gates.
- **Completion criteria:** parent/child hashes and diffs reproduce; restore never rewrites; unsupported claim state representable.
- **Rollback/recovery:** versions retained; prior reader remains one-release compatible. **Docs:** editor/versioning/design.

## M06 — Resume and cover-letter import

**Implementation status:** In progress. Migration 0006, private filesystem storage, streaming/signature validation, bounded PDF/DOCX/Markdown/text/JSON parsers, no-network production sidecar, source preview/download/delete UI, and focused parser/security tests are implemented. Focused unit/parser/security gates and the production build pass locally. PostgreSQL integration, browser accessibility/E2E, clean migration, and Compose sidecar validation remain unverified in this continuation because the local Docker engine is unavailable; M06 is not complete until those gates pass.

- **Objective:** Build private artifact storage, quarantine, isolated PDF/DOCX/Markdown/text/JSON parsing, and source metadata.
- **User-visible outcome:** allowed documents import with text/structure/locator preview and safe warnings.
- **Scope:** limits/signature validation, parser child boundary, checksums, temporary cleanup, filesystem store.
- **Non-scope:** OCR, arbitrary formats/layout preservation, AI extraction approval.
- **Prerequisites/dependencies:** M02–M05.
- **Likely files/subsystems:** artifact/parser adapters, worker jobs, upload API, source UI, malicious fixtures.
- **Data-model impact:** SourceDocument, parse operation/result/proposal staging, storage metadata.
- **Security:** T01/T02 limits/sandbox/no-network, archive/XML defenses, authorized streams.
- **Accessibility:** upload alternative to drag, progress/status, source preview navigation/warnings.
- **Required tests:** AC-004; parser contract/goldens; bomb/polyglot/path/crash/timeout/cleanup; cross-user downloads.
- **Validation commands:** gates plus `pnpm test:parsers && pnpm test:security` and container resource test.
- **Completion criteria:** every allowed fixture imports; hostile corpus fails safely; no quarantined object is public/orphaned.
- **Rollback/recovery:** disable parser job types; retain/quarantine or delete user-selected bytes; reconcile orphans. **Docs:** pipeline/file security/storage ADR outcome.

## M07 — Extraction review and approval

**Implementation status:** In progress. Migration 0007, workspace-scoped pending batches/proposals, deterministic normalized-line extraction, optimistic proposal edits, approve/reject/exact-duplicate merge, transactional counted bulk approval, immutable evidence creation, audit metadata redaction, and the responsive review UI are implemented. Unit tests, type checking, linting, Drizzle schema checks, documentation checks, and the production build pass locally. PostgreSQL integration, browser E2E/accessibility, clean migration, and supported Node 24 container gates remain unverified while the local Docker engine is unavailable. AI-01 provider integration remains correctly deferred to M12.

- **Objective:** Add AI-01/provider-independent proposal ingestion and side-by-side approve/edit/reject/merge workflow.
- **User-visible outcome:** imported facts enter the bank only after granular review.
- **Scope:** deterministic/basic extraction fallback, model task hook, source locators, bulk confirmation, conflicts/duplicates.
- **Non-scope:** automatic approval or tailoring.
- **Prerequisites/dependencies:** M04, M06, and M12 for model extraction; deterministic/manual proposal entry may land before the adapter integration.
- **Likely files/subsystems:** extraction task contract, proposals UI/domain, source viewer.
- **Data-model impact:** extraction proposal status/batch and approval links to immutable facts.
- **Security:** imported instructions treated as data; proposal ownership; no unreviewed eligibility.
- **Accessibility:** synchronized source/proposal focus, keyboard batch review, programmatic statuses.
- **Required tests:** AC-005, approval eligibility invariant, locator accuracy, injection strings, duplicates, bulk summary.
- **Validation commands:** core/integration/E2E/a11y plus `pnpm test:contract`.
- **Completion criteria:** zero proposal can be queried as approved; every decision attributable; manual import useful without AI.
- **Rollback/recovery:** proposals remain pending; approved facts are not rolled back silently. **Docs:** extraction UX/AI task/flows.

## M08 — Job-description text and file ingestion

**Implementation status:** In progress. Migration 0008, bounded deterministic normalization, pasted-text and isolated parsed-file inputs, immutable hash-addressed job revisions, optimistic corrections, archive/restore, input provenance, source-unavailable handling, workspace isolation, and responsive job screens are implemented. Job-description sources cannot enter career-fact extraction. Unit tests, type checking, linting, Drizzle checks, and the production build pass locally. PostgreSQL integration, browser E2E/accessibility, clean migration, supported Node 24, and Compose gates remain unverified while the local Docker engine is unavailable. URL input remains correctly scoped to M09.

- **Objective:** Accept pasted text and allowed files, normalize immutable job snapshots, and support safe correction/versioning.
- **User-visible outcome:** users can create a job record without AI or URL retrieval.
- **Scope:** paste/file tabs, parsing reuse, metadata, immutable snapshot, size/quality warnings.
- **Non-scope:** URL fetch and requirement extraction.
- **Prerequisites/dependencies:** M03, M06.
- **Likely files/subsystems:** jobs domain/API/UI, source pipeline integration.
- **Data-model impact:** JobPosting snapshot/revision and input provenance.
- **Security:** same file controls, bounded text, workspace scope, no active HTML rendering.
- **Accessibility:** tab semantics, text alternative, progress/errors, mobile reflow.
- **Required tests:** normalization/hash/version, allowed/hostile files, IDOR, XSS, immutable correction.
- **Validation commands:** core/integration/contract/E2E/a11y/security gates.
- **Completion criteria:** AC-006 text/file portions pass; original/revised snapshots are reproducible.
- **Rollback/recovery:** disable input format; preserve existing immutable jobs/export. **Docs:** job pipeline/UX.

## M09 — Secure URL ingestion

**Implementation status:** In progress. Migration 0009, URL canonicalization, public IPv4/IPv6 classification, all-address DNS validation, TLS address pinning, redirect revalidation, connection/total timeouts, header/body/decompression-ratio/content-type limits, inert HTML extraction, authenticated UI, ten-per-workspace-hour rate accounting, idempotent database operations, private schema-validated queue, no-credential fetcher container, safe failures, and immutable URL job snapshots are implemented. Unit/security tests, type checking, linting, Drizzle checks, Compose configuration, and production build pass locally. PostgreSQL integration, isolated malicious network fixtures, browser E2E/accessibility, clean migration, supported Node 24, and live Compose gates remain unverified while Docker is unavailable; M09 is not complete.

- **Objective:** Implement isolated SSRF-hardened public HTTPS job retrieval and sanitized text extraction.
- **User-visible outcome:** users can import compatible public static job pages or use clear paste/upload fallback.
- **Scope:** canonicalization, DNS/IP policy, pinning, redirects, TLS, limits, HTML extraction, egress/rates.
- **Non-scope:** logged-in/dynamic/headless browser scraping, crawling.
- **Prerequisites/dependencies:** M08, worker from M02.
- **Likely files/subsystems:** fetcher adapter/worker, URL UI, network fixtures.
- **Data-model impact:** safe fetch metadata/checksum/warnings on job snapshot.
- **Security:** T05/ADR-0017 in full; proxy bypass/rebinding/mixed DNS/metadata tests.
- **Accessibility:** errors explain fallback and retain entered URL without exposing network internals.
- **Required tests:** AC-006 URL portion; redirect/DNS/IPv4/IPv6/slow/compressed/content-type/rate cases.
- **Validation commands:** core gates plus `pnpm test:ssrf && pnpm test:security` in isolated network fixture.
- **Completion criteria:** all forbidden network cases fail before content persistence; no cookies/subresources/scripts; operator kill switch works.
- **Rollback/recovery:** disable URL feature via config; existing snapshots remain. **Docs:** URL security, deployment egress, abuse cases.

## M10 — Job requirement analysis

**Implementation status:** In progress. Migration 0011, deterministic/manual/AI-02 draft creation, closed output schema, exact source-span hard validation, user edit/accept/reject/manual-add review, immutable finalization, correction copy-forward, provider selection, safe fallback states, and responsive semantic UI are implemented. Formatting, lint, type, unit, migration-artifact/schema-drift, AI-02 synthetic evaluation, security, and production-build gates pass locally. PostgreSQL integration and browser E2E/accessibility remain unverified because the local Docker engine is unavailable; M10 is not complete until those gates pass.

- **Objective:** Implement AI-02 task plus manual/deterministic review for structured required/preferred qualifications, responsibilities, terms, and ambiguities.
- **User-visible outcome:** users inspect and correct source-linked job requirements.
- **Scope:** schema, source spans, requirement types/priority, immutable reviewed revisions.
- **Non-scope:** evidence ranking/tailoring.
- **Prerequisites/dependencies:** M08 and M12; manual requirement entry remains independently usable when a provider is unavailable.
- **Likely files/subsystems:** requirement domain/API/UI, task schema/evals.
- **Data-model impact:** JobRequirement with job revision, source locator, review state.
- **Security:** job injection separation, bounded context, no model output auto-authority.
- **Accessibility:** categorized list/editor, source focus, ambiguity/error semantics.
- **Required tests:** AC-007, schema repair budget, source-span validation, manual fallback, injection/refusal.
- **Validation commands:** core/contract/E2E/a11y plus `pnpm test:evals --task AI-02`.
- **Completion criteria:** invalid output never becomes reviewed requirements; corrections create immutable revision; eval threshold passes recommended model.
- **Rollback/recovery:** disable AI task and retain manual reviewed data. **Docs:** task/schema/evals/job analysis UX.

## M11 — Requirement-to-evidence matching

- **Objective:** Build deterministic candidate retrieval and matrix; optionally AI-03/04 rerank only allowed candidates.
- **User-visible outcome:** each requirement shows direct/combined/weak/no evidence and user-controlled selections.
- **Scope:** structured filters, lexical search, reasons/strength/conflicts/gaps, include/exclude.
- **Non-scope:** embeddings/vector DB, automatic claims.
- **Prerequisites/dependencies:** M04, M10; M12 for optional reranking.
- **Likely files/subsystems:** matching domain/rules/API/matrix UI, eval fixtures.
- **Data-model impact:** RequirementEvidenceMatch with method/version/strength/user decision.
- **Security:** same-workspace active facts only; model candidate subset; no content leakage.
- **Accessibility:** matrix list alternative, row/column headers, keyboard actions, non-color strength.
- **Required tests:** AC-008, retrieval recall, conflict/withdrawal, cross-workspace fabricated ID, deterministic ordering.
- **Validation commands:** core/integration/E2E/a11y plus `pnpm test:evals --task AI-03,AI-04`.
- **Completion criteria:** explicit gaps preserved; candidate leakage zero; matrix usable at 320px via list view.
- **Rollback/recovery:** remove model ranks and recompute deterministic matches; user decisions versioned. **Docs:** matching/task/IA.

## M12 — AI-provider abstraction

**Implementation status:** In progress. Migration 0010, workspace-scoped provider settings, AES-256-GCM write-only credentials and environment references, public/private endpoint policy, pinned bounded HTTP transport, OpenAI-compatible and native Ollama adapters, AI-01–11 task registry, structured-output repair/hard-failure runner, transient retry/deadline/token controls, process-local request guard, fake provider, adapter contracts, and synthetic evaluation smoke tests are implemented. Formatting, lint, type, unit, contract, evaluation-smoke, migration-artifact, schema-drift, security, and production-build gates pass locally. PostgreSQL integration, browser E2E/accessibility, live opt-in provider contracts, and Compose validation remain unverified because the local Docker engine is unavailable; M12 is not complete until the non-live environment gates pass. Live provider tests remain operator opt-in and are not required to send career data.

- **Objective:** Implement task registry, OpenAI-compatible and Ollama adapters, capability tests, encrypted credentials, schema/retry/failure framework.
- **User-visible outcome:** users configure/test a provider, see destination/capabilities, and assign models to tasks without exposing keys.
- **Scope:** write-only credentials, endpoint policy, normalized refusals/usage/timeouts, fake provider, AI-01–11 contracts.
- **Non-scope:** additional provider SDKs, hosted inference, provider tools/file stores.
- **Prerequisites/dependencies:** M02, M03; enables model paths in M07/M10/M11 and M13+.
- **Likely files/subsystems:** providers infrastructure/settings, crypto envelope, task runner, contract/eval harness.
- **Data-model impact:** ModelProviderConfiguration, task manifest/attempt metadata, key version.
- **Security:** AC-022; SSRF class endpoint validation/allowlist, minimal context, redacted logs, bounded cost/retries.
- **Accessibility:** provider forms/errors/capability table/secret status; no secret revealed after entry.
- **Required tests:** adapter contracts, schema/refusal/timeout/rate/idempotency, encryption/rotation/wrong key, endpoint abuse, synthetic capability.
- **Validation commands:** core/security/contract/integration plus `pnpm test:evals --smoke`.
- **Completion criteria:** both adapters pass fake/live-opt-in contract; keys absent from client/log/snapshots; invalid output fails safe.
- **Rollback/recovery:** disable provider config/task; rotate/revoke credentials; manual features remain. **Docs:** provider support/secrets/eval results.

## M13 — Evidence-grounded resume tailoring

- **Objective:** Implement setup and AI-05/06 atomic resume suggestions with locks, requirements, claim spans, evidence validation, and explanations.
- **User-visible outcome:** users receive reviewable grounded resume changes without automatic document mutation.
- **Scope:** source version/fact selection, section/bullet operations, gaps, run manifest, lock enforcement.
- **Non-scope:** cover letters, bulk auto-accept, unsupported claims.
- **Prerequisites/dependencies:** M05, M11, M12.
- **Likely files/subsystems:** tailoring domain/API/setup/review UI, AI task/postvalidators.
- **Data-model impact:** TailoringRun, TailoringSuggestion, claim candidate and pinned inputs/versions.
- **Security:** AC-009/010/012; prompt injection, unknown IDs, metrics/dates, locked hashes, provider minimization.
- **Accessibility:** setup controls, data-send disclosure, suggestion diff/evidence inspector keyboard and screen-reader flow.
- **Required tests:** supported/missing/conflicting/ambiguous evidence, injection, lock, schema, stale base, eval zero escaped unsupported.
- **Validation commands:** core/E2E/a11y/security plus `pnpm test:evals --task AI-05,AI-06`.
- **Completion criteria:** suggestions only, complete provenance, gaps explicit, no locked mutation or unsupported suggestion reaches review.
- **Rollback/recovery:** discard runs/suggestions without changing source; revoke problematic task version. **Docs:** tailoring/provenance/prompts/flows.

## M14 — Evidence-grounded cover-letter tailoring

- **Objective:** Implement AI-07/08 evidence-linked plan and paragraph suggestions using the same claim gate.
- **User-visible outcome:** users can review a grounded letter outline/draft tied to job requirements and facts.
- **Scope:** letter setup, company/role fields from reviewed job, plan review, paragraph claims, preferences/locks.
- **Non-scope:** invented contacts/salutations/company research, generic unsupported flattery facts.
- **Prerequisites/dependencies:** M13, M05.
- **Likely files/subsystems:** cover-letter task/UI templates/validators.
- **Data-model impact:** tailoring run/suggestion reuse; typed letter blocks/claims.
- **Security:** same grounding/injection/data minimization; job/company assertions require job-span evidence or remain nonfactual framing.
- **Accessibility:** outline then draft reading order, paragraph-level review, mobile evidence drawer.
- **Required tests:** AC-010, missing company/contact, conflicts, claim coverage, plan/draft schema, AI-07/08 evals.
- **Validation commands:** core/E2E/a11y/security plus `pnpm test:evals --task AI-07,AI-08`.
- **Completion criteria:** every factual letter span supported; user can complete flow manually if provider fails.
- **Rollback/recovery:** discard plan/draft suggestions; source version unaffected. **Docs:** task catalog/failure modes/letter UX.

## M15 — Editing and suggestion review

- **Objective:** Complete production editor, atomic/group review, provenance-aware manual edits, stale handling, undo/version save.
- **User-visible outcome:** users accept/reject individual suggestions, edit freely, see support status, and recover versions.
- **Scope:** operation application transaction, claim diff mapping, link/approve-as-fact, autosave conflict UI.
- **Non-scope:** collaboration/CRDT, arbitrary HTML, template designer.
- **Prerequisites/dependencies:** M05, M13, M14.
- **Likely files/subsystems:** editor engine/UI, suggestion service, provenance mapper, version comparison.
- **Data-model impact:** decision metadata, claim/evidence snapshots, draft revisions; no mutable historical versions.
- **Security:** AC-011–015; output XSS, stale/lock bypass, cross-workspace evidence ID, concurrency.
- **Accessibility:** full editor keyboard/AT evaluation, focus after decisions, structured paste, shortcuts, 320px review.
- **Required tests:** property diff/anchors, manual factual/nonfactual edits, atomic batch, stale conflict, XSS, E2E/AT manual matrix.
- **Validation commands:** all core gates plus `pnpm test:e2e && pnpm test:a11y && pnpm test:security`.
- **Completion criteria:** AC-011–015 pass; uncertain changed claims become unverified; no silent overwrite; manual accessibility sign-off.
- **Rollback/recovery:** version history restores content; drafts export as JSON before schema recovery. **Docs:** editor behavior/versioning/accessibility.

## M16 — Deterministic ATS analysis

- **Objective:** Implement versioned pure ATS rules, category math/coverage/blockers, findings UI, and optional AI-11 explanation.
- **User-visible outcome:** reproducible estimated parsing/alignment/content report with rule-level remediation and limitations.
- **Scope:** all 15 rubric categories, canonical/export parse-back hooks, job comparison, ruleset fixtures.
- **Non-scope:** proprietary ATS emulation, hiring prediction, AI scoring.
- **Prerequisites/dependencies:** M10, M15; M17 supplies final format parse-back later.
- **Likely files/subsystems:** ATS rule engine/registry/report UI/fixtures.
- **Data-model impact:** ATSReport, ATSFinding, ruleset/input hashes.
- **Security:** local default, no protected-class/prestige rules, hidden-keyword/unsupported detection, AI cannot alter numbers.
- **Accessibility:** calculation tables/list view, non-color bands, finding focus links, limitation text.
- **Required tests:** AC-016/017; all fixture families, property math/caps/applicability, deterministic repeat, AI faithfulness.
- **Validation commands:** core gates plus `pnpm test:ats && pnpm test:a11y`.
- **Completion criteria:** 100-weight rubric implemented/versioned; <80% coverage suppression; golden/property tests pass.
- **Rollback/recovery:** retain old ruleset/recalculate; reports pin versions. **Docs:** ATS methodology/rubric/fixtures/limitations.

## M17 — Export pipeline

- **Objective:** Implement safe PDF, DOCX, Markdown, text, JSON exporters, final gate, private artifacts, parse-back/visual validation.
- **User-visible outcome:** users download readable final supported documents or explicitly labeled permitted drafts.
- **Scope:** fixed accessible templates, networkless render, format options, artifact expiry/save.
- **Non-scope:** arbitrary templates, pixel-identical imported layout, draft PDF/DOCX.
- **Prerequisites/dependencies:** M15; integrates M16 parse-back.
- **Likely files/subsystems:** renderers/templates/worker/artifacts/export UI/tests.
- **Data-model impact:** ExportArtifact and manifest/expiry/template/renderer metadata.
- **Security:** AC-015/019; escape/sanitize, no network/scripts, resource limits, authorized attachment, malicious template/content.
- **Accessibility:** PDF/DOCX headings/lists/language/reading order; keyboard export flow and errors.
- **Required tests:** text equivalence, PDF/DOCX parse/open, snapshots/overflow/Unicode, injection/remote asset, final blocker, cleanup.
- **Validation commands:** core gates plus `pnpm test:exports && pnpm test:e2e && pnpm test:a11y`.
- **Completion criteria:** AC-019 and OQ-02 decision; supported fixtures meet fidelity/accessibility; final gate cannot bypass.
- **Rollback/recovery:** disable affected format; delete partial objects; canonical versions remain. **Docs:** exporter/library limitations/deployment fonts.

## M18 — Settings, privacy, and data portability

- **Objective:** Complete settings, task defaults/disclosures, archive export/import preview, record/source/workspace deletion and receipts.
- **User-visible outcome:** users control providers/privacy, export all portable data, and permanently delete scoped/all data.
- **Scope:** versioned archive, conflict/dry-run, secret exclusion, retention display, binary-only deletion, durable delete job.
- **Non-scope:** external-provider deletion automation, cross-instance sync, account transfer.
- **Prerequisites/dependencies:** M04–M17, especially storage/jobs/auth.
- **Likely files/subsystems:** settings/portability/deletion domains/UI/archive schemas.
- **Data-model impact:** export/import/deletion operation, tombstones/receipts; cascades finalized.
- **Security:** recent reauth, path/archive validation, no secret plaintext, freeze/verify/orphan scan/tombstone replay.
- **Accessibility:** destructive impact/typed confirmation/focus, progress/status, archive preview tables/list.
- **Required tests:** AC-020–022; round-trip/dry-run/conflicts, partial outage/retry/concurrent write/restore/cross-workspace.
- **Validation commands:** all core/security/E2E/a11y plus `pnpm test:portability && pnpm test:deletion`.
- **Completion criteria:** active erase ≤24h workflow and backup ≤30d status; round trip passes; secrets absent; deletion drill passes.
- **Rollback/recovery:** deletion cannot be undone after active erase; restore only user-provided export; failed job safely resumes. **Docs:** privacy/retention/data lifecycle/operator backup.

## M19 — Security hardening

- **Objective:** Close the threat model with abuse tests, quotas/rates, CSP/headers, container/runtime hardening, SCA/secrets/SAST, and remediation.
- **User-visible outcome:** safer defaults and clear recoverable security errors without leaked details.
- **Scope:** T01–T16/ACASE-01–12, dependency/image review, permissions, egress, audit events.
- **Non-scope:** formal certification, penetration-test guarantee, host-root defense.
- **Prerequisites/dependencies:** M01–M18 feature complete.
- **Likely files/subsystems:** all trust boundaries, security CI/fixtures/docs.
- **Data-model impact:** indexes/quotas/audit fields only; migration security reviewed.
- **Security:** entire milestone; critical/high reachable findings block.
- **Accessibility:** security controls/errors do not create keyboard/cognitive barriers; timeouts warn/extend where safe.
- **Required tests:** AC-025; threat/abuse matrix, load/resource, log/secret snapshots, dependency/container scan; independent review.
- **Validation commands:** full gates plus `pnpm security:check && pnpm test:security && pnpm test:load`.
- **Completion criteria:** every threat has passing evidence/residual note; no unexpired critical/high exception; incident process exercised.
- **Rollback/recovery:** feature kill switches and previous compatible image; never rollback security migration into exposure. **Docs:** threat/risk/security policy.

## M20 — Accessibility and responsive hardening

- **Objective:** Validate/remediate every major screen to WCAG 2.2 AA across reflow, keyboard, AT, contrast, motion, and export.
- **User-visible outcome:** core workflows work without pointer and at narrow/zoomed layouts with clear status/evidence.
- **Scope:** automated plus manual matrix, content language, mobile/list alternatives, editor/export AT checks.
- **Non-scope:** native apps or unsupported legacy browsers.
- **Prerequisites/dependencies:** M03–M18 UI complete; security controls from M19 included.
- **Likely files/subsystems:** design system/components/screens/templates/tests.
- **Data-model impact:** none except persisted accessibility preferences if justified.
- **Security:** accessible reauth/confirmations and no hidden security state.
- **Accessibility:** AC-024 and the full accessibility specification.
- **Required tests:** axe pages/components, keyboard E2E, 320px/200%/forced colors/reduced motion, NVDA/VoiceOver manual, PDF/DOCX reading order.
- **Validation commands:** `pnpm test:a11y && pnpm test:e2e && pnpm test:exports` plus core gates.
- **Completion criteria:** no blocker/critical defects; WCAG mapping/evidence recorded; OQ-07 resolved.
- **Rollback/recovery:** revert inaccessible component change while preserving API/data. **Docs:** accessibility/design/known format limits.

## M21 — End-to-end and recovery validation

- **Objective:** Exercise release-scale clean install, all user journeys, concurrency/faults, performance, upgrade/restore/delete replay, and traceability.
- **User-visible outcome:** documented repeatable workflows survive expected failures without lost or leaked data.
- **Scope:** AC-001–028, provider outage, parser crash, worker restart, storage/database disruption, performance budgets.
- **Non-scope:** unbounded scale/HA certification.
- **Prerequisites/dependencies:** M01–M20.
- **Likely files/subsystems:** E2E/fault/load fixtures, Compose, migration/backup scripts, docs checker.
- **Data-model impact:** validate rather than redesign; defects return to owning milestone.
- **Security:** tenant/deletion/secret/SSRF/injection scenarios in integrated deployment.
- **Accessibility:** critical-path manual regression included, not only isolated pages.
- **Required tests:** full test strategy, clean host, upgrade N-1, backup/restore+tombstones, idempotency, performance AC-027, traceability AC-028.
- **Validation commands:** every command in `QUALITY_GATES.md`, clean `docker compose` smoke, documented restore drill.
- **Completion criteria:** all AC evidence linked; no flaky release gate; budgets pass or dated accepted noncritical exception.
- **Rollback/recovery:** exercise previous image and verified backup; record RTO observations. **Docs:** all current-state/operations/risks.

## M22 — Self-hosted MVP release

- **Objective:** Produce the first signed, documented, reproducible AGPL self-hosted release.
- **User-visible outcome:** operator can install, configure, back up, upgrade/rollback, and use release-ready MVP from published artifacts.
- **Scope:** release images/source/SBOM/checksums/provenance, Compose, changelog, support/security versions, operator guide.
- **Non-scope:** hosted SaaS, Kubernetes/HA, automatic production deployment.
- **Prerequisites/dependencies:** M21 and every M01–M20 completion criterion.
- **Likely files/subsystems:** release CI/config/docs/metadata; no new product feature.
- **Data-model impact:** freeze/review migration/archive/ruleset/task versions.
- **Security:** signed/pinned artifacts, scan, disclosure channel, secret checklist, no critical/high open exploitable issue.
- **Accessibility:** published conformance/known limitations and install docs are accessible.
- **Required tests:** clean air/local provider and remote provider installs, upgrade/rollback/restore, release artifact verification.
- **Validation commands:** full release checklist in `RELEASE_PROCESS.md` plus signature/SBOM/container/Compose verification.
- **Completion criteria:** MVP release-ready definition met; artifacts reproducible/verified; docs state exact supported versions/limits.
- **Rollback/recovery:** yank/mark affected release, publish advisory/fixed version; operators use tested prior image/backup plan. **Docs:** release notes/security support/roadmap.

## Critical path and parallel work

Critical path: **M01 → M02 → M03 → M04 → M05 → M06 → M08 → M10 → M11 → M13 → M14 → M15 → M16 → M17 → M18 → M19 → M20 → M21 → M22**, with **M12 starting after M03 and joining before M10**. M07 is required for release but can run beside M08/M10 once M06 and M12 finish. M09 is required before release but can run beside M10 after M08. After M05, parser work and editor design can overlap. After M15, ATS (M16) and export foundations (M17) can overlap, then integrate. Documentation, threat modeling, accessibility checks, and fixtures are continuous work, not final-stage additions.
