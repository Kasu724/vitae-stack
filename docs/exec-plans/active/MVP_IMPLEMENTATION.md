# MVP implementation plan

**Status (2026-07-03):** M01-M21 product work exists. M22 is being revalidated after the local-only SQLite/no-account architecture transition. No public release is claimed.

## M01 — Repository and development foundation

**Implementation status:** Complete in the local repository. Static, unit, documentation, security, build, and browser E2E gates passed under Node 24 in the recorded baseline; the portable ZIP bundles pinned Node 24.18.0 and no package manager is needed at runtime. Extracted-package health/smoke checks passed in that baseline. Remote GitHub Actions execution remains external evidence and must not be claimed as passing locally.

- **Objective:** Establish pinned Node/pnpm/Next.js/TypeScript tooling, modular boundaries, format/lint/type/unit/build/docs commands, synthetic fixture policy, and minimal portable package SQLite service.
- **User-visible outcome:** A documented local landing/status page can run; it explicitly says features are not yet available.
- **Scope:** manifests/configuration, strict compiler, Tailwind tokens, test runner, health shell, CI PR checks, developer setup.
- **Non-scope:** database domain schema, local principal, product screens, AI.
- **Prerequisites/dependencies:** accepted docs/ADRs; none earlier.
- **Likely files/subsystems:** root config, `src/app`, module boundary config, `tests`, portable package, `.github/workflows`.
- **Data-model impact:** none beyond a connection probe.
- **Security:** pinned dependencies/actions/runtime, secret-safe environment validation, loopback-only baseline, and package-data exclusion.
- **Required tests:** config/env, health, example unit, docs links, clean install/build.
- **Validation commands:** `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm docs:check && pnpm build`; portable-package inspection.
- **Completion criteria:** commands exist/pass on clean supported hosts and CI; no implementation claim beyond shell; exact versions documented.
- **Rollback/recovery:** revert foundation commit; no user data. **Docs:** update setup, structure, CI, AGENTS planned-command labels.

## M02 — Database and migrations

**Implementation status:** Implemented as a reviewed SQLite baseline plus forward-only integrity migration, with canonical line-ending-independent checksum tracking, foreign keys, ownership/context constraints, immutable-history/frozen-workspace triggers, and fail-closed readiness checks.

- **Objective:** Provide the local SQLite schema, forward migration runner, ownership constraints, job/audit primitives, and isolated test harness.
- **User-visible outcome:** startup creates or upgrades one local `vitae.sqlite` file and readiness reports schema state.
- **Scope:** local identity/workspace/profile skeleton, transactions, reviewed migrations, and synthetic-only seeds.
- **Non-scope:** external database servers, ORM generation, database accounts, replication, or HA.
- **Prerequisites/dependencies:** M01.
- **Likely files/subsystems:** `db/migrations`, `src/infrastructure/database`, repositories, and integration tests.
- **Data-model impact:** all relational aggregates, foreign keys, indexes, triggers, and migration journal are SQLite-owned.
- **Security:** parameterized values, foreign keys, composite workspace ownership, local file permissions, and backup-before-migrate policy.
- **Required tests:** empty/current migration, checksum drift, rollback, constraints, trigger immutability, lease concurrency, and cross-workspace FK rejection.
- **Validation commands:** `pnpm db:check && pnpm test:integration && pnpm typecheck`.
- **Completion criteria:** a fresh local file migrates, readiness passes, schema integrity checks pass, and no external service is contacted.
- **Rollback/recovery:** stop the app and restore a coordinated pre-migration data-folder copy; no destructive down migration. **Docs:** data model/deployment/debugging.

## M03 — Local principal and workspace isolation

**Implementation status:** Implemented as one server-derived local principal/workspace. Account, password, session, registration, and sign-in code are intentionally absent.

- **Objective:** Auto-provision one local principal/workspace, enforce loopback-only startup, and centralize workspace policy.
- **User-visible outcome:** the local workspace opens immediately without an account.
- **Scope:** trusted-local principal, authority checks, workspace predicates, and destructive-action confirmation.
- **Non-scope:** passwords, sessions, signup, OIDC/social, remote hosting, or shared roles.
- **Prerequisites/dependencies:** M02.
- **Likely files/subsystems:** local principal/workspace module, request boundary, repository policy, and security tests.
- **Data-model impact:** one opaque local user, membership, workspace, and profile; no account/session tables.
- **Security:** loopback fail-closed validation, forwarded-authority rejection, IDOR tests, and no browser-selectable principal.
- **Required tests:** auto-provisioning, stable principal, workspace isolation, unsafe-start rejection, and no sign-in UI.
- **Validation commands:** `pnpm test && pnpm test:integration && pnpm test:contract && pnpm test:e2e && pnpm security:check`.
- **Completion criteria:** AC-001/AC-023 pass and the application cannot be configured for supported remote access.
- **Rollback/recovery:** restore the coordinated local data folder; never enable remote access as a fallback. **Docs:** identity/security/deployment.

## M04 — Career Information Bank

**Implementation status:** Complete in the local repository. The baseline schema contains structured entries, profile settings, reusable skills, proposals, immutable evidence, and composite workspace ownership. The UI groups typed items into canonical Career Information Bank sections, exposes applicable education/project attributes, and keeps editable item notes distinct from proposed/approved bullets and detailed factual context. It also supports all MVP entry types, partial dates, typed metric proposals, explicit fact review, correction/withdrawal, provenance inspection, search, duplicate indication, archive/restore, and counted permanent deletion. Record deletion locks and rechecks the complete selection, blocks saved-document-claim dependencies, and removes eligible evidence/analysis atomically. Focused unit and SQLite integration gates pass in the current change; full browser/release revalidation remains M21 scope. Remote CI remains unverified.

- **Objective:** Implement structured entries, skills, goals/preferences, fact proposals, approval/supersede/withdraw/delete lifecycle, search/filter.
- **User-visible outcome:** users can build and manage verified career data manually.
- **Scope:** all MVP entry types, typed metrics/dates, provenance inspector, duplicate/conflict indicators.
- **Non-scope:** document extraction and AI.
- **Prerequisites/dependencies:** M03.
- **Likely files/subsystems:** career domain/repositories/API/UI, schemas, search.
- **Data-model impact:** CareerEntry, EvidenceFact, Skill, CareerEntrySkill, proposal and lifecycle indexes.
- **Security:** workspace scope, sensitive search, audit without values, dependent delete authorization.
- **Required tests:** lifecycle/state/property tests, typed validation, search isolation, concurrency, AC-002/003.
- **Validation commands:** all core gates plus `pnpm test:integration && pnpm test:e2e`.
- **Completion criteria:** every entry type is create/read/update/archive; immutable facts cannot mutate; dependency preview works.
- **Rollback/recovery:** use the prior compatible package with a coordinated pre-migration data copy; export facts before destructive recovery. **Docs:** CIB UX/data lifecycle/traceability.

## M05 — Document library and versioning

**Implementation status:** Complete in the local repository. The baseline schema contains resumes/cover letters, immutable full snapshots, section projections, optimistic drafts, claim/evidence primitives, and locks. The structured editor autosaves drafts, creates idempotent versions, compares structure/text/claims/provenance, archives documents, restores by copy-forward, and deletes confirmed whole-document aggregates. Deletion locks/rechecks the complete selection, blocks unexpected external history references, stages private export bytes for rollback safety, and removes eligible histories and derived records atomically. Forward integrity guards prevent ordinary history mutation or individual-version deletion. Unit, SQLite integration, default-browser E2E, and XSS/plain-text checks pass locally; the explicit narrow-reflow matrix is tracked in M20. Remote CI remains unverified.

- **Objective:** Implement logical resumes/letters, typed canonical schema, drafts, immutable versions, compare/restore, locks and claim primitives.
- **User-visible outcome:** users create, edit metadata, save, compare, restore, archive, and select document versions.
- **Scope:** safe basic structured editor, optimistic concurrency, lineage, autosave draft, whole-document deletion and managed-artifact cleanup.
- **Non-scope:** import, AI suggestions, rich export.
- **Prerequisites/dependencies:** M04 (facts), M03.
- **Likely files/subsystems:** documents domain/API/editor shell/version UI.
- **Data-model impact:** Document, DocumentVersion, DocumentSection projection, GeneratedClaim, ClaimEvidence, draft/lock.
- **Security:** restricted node schema, escaping, ownership/download absence, conflict integrity.
- **Required tests:** schema/migration, immutable snapshots, concurrent draft, restore copy-forward, aggregate deletion/rollback/artifact cleanup, XSS/paste, AC-018/021.
- **Validation commands:** core/integration/contract/E2E/build gates.
- **Completion criteria:** parent/child hashes and diffs reproduce; restore never rewrites; unsupported claim state representable.
- **Rollback/recovery:** versions retained; prior reader remains one-release compatible. **Docs:** editor/versioning/design.

## M06 — Resume and cover-letter import

**Implementation status:** Complete locally. The SQLite baseline, private local file storage, streaming/signature validation, bounded PDF/DOCX/Markdown/text/JSON parser child, and source preview/download/delete UI pass parser/security, integration, browser, and portable-package checks.

- **Objective:** Build private artifact storage, quarantine, isolated PDF/DOCX/Markdown/text/JSON parsing, and source metadata.
- **User-visible outcome:** allowed documents import with text/structure/locator preview and safe warnings.
- **Scope:** limits/signature validation, parser child boundary, checksums, temporary cleanup, filesystem store.
- **Non-scope:** OCR, arbitrary formats/layout preservation, AI extraction approval.
- **Prerequisites/dependencies:** M02–M05.
- **Likely files/subsystems:** artifact/parser adapters, in-process queue jobs, upload API, source UI, malicious fixtures.
- **Data-model impact:** SourceDocument, parse operation/result/proposal staging, storage metadata.
- **Security:** ACASE-02/06/07 limits, sandbox/no-network parsing, archive/XML defenses, and authorized streams.
- **Required tests:** AC-004; parser contract/goldens; bomb/polyglot/path/crash/timeout/cleanup; cross-user downloads.
- **Validation commands:** gates plus `pnpm test:parsers && pnpm test:security` and parser child crash/timeout/resource tests.
- **Completion criteria:** every allowed fixture imports; hostile corpus fails safely; no quarantined object is public/orphaned.
- **Rollback/recovery:** disable parser job types; retain/quarantine or delete user-selected bytes; reconcile orphans. **Docs:** pipeline/file security/storage ADR outcome.

## M07 — Extraction review and approval

**Implementation status:** Complete locally. The baseline schema, recommended closed-schema AI-01 exact-span extraction, provider-independent `deterministic-sections@2` fallback, canonical section/item proposal grouping, checkbox-selected approve/reject confirmation, grouped review/merge, immutable evidence creation, redacted task/audit metadata, destination disclosure, and review UI are implemented. Focused unit, SQLite integration, and extraction-review browser gates pass in the current change; deterministic extraction keeps review usable without a provider and full browser/release revalidation remains M21 scope.

- **Objective:** Make AI-01 the recommended path for section → item → fact proposal ingestion while retaining a provider-independent section/item heuristic and a checkbox-selected approve/reject, edit, and duplicate-merge workflow.
- **User-visible outcome:** imported facts enter the bank only after granular review.
- **Scope:** deterministic/basic extraction fallback, model task hook, source locators, bulk confirmation, conflicts/duplicates.
- **Non-scope:** automatic approval or tailoring.
- **Prerequisites/dependencies:** M04, M06, and M12 for model extraction; deterministic/manual proposal entry may land before the adapter integration.
- **Likely files/subsystems:** extraction task contract, proposals UI/domain, source viewer.
- **Data-model impact:** extraction proposal status/batch and approval links to immutable facts.
- **Security:** imported instructions treated as data; proposal ownership; no unreviewed eligibility.
- **Required tests:** AC-005, approval eligibility invariant, locator accuracy, injection strings, duplicates, bulk summary.
- **Validation commands:** core/integration/E2E plus `pnpm test:contract`.
- **Completion criteria:** zero proposal can be queried as approved; every decision attributable; manual import useful without AI.
- **Rollback/recovery:** proposals remain pending; approved facts are not rolled back silently. **Docs:** extraction UX/AI task/flows.

## M08 — Job-description text and file ingestion

**Implementation status:** Complete locally. The baseline schema, pasted-text and isolated parsed-file inputs, immutable job revisions, corrections, archive/restore, whole-aggregate deletion, provenance, source-unavailable handling, workspace isolation, and job screens are implemented. Job deletion previews derived records, locks and rechecks the complete selection, rolls back missing/mixed/blocked selections, preserves separately managed sources, and blocks accepted-document-version dependencies. SQLite integration and browser card-action coverage exercise this boundary; broader release evidence remains governed by the current validation ledger. URL input remains scoped to M09.

- **Objective:** Accept pasted text and allowed files, normalize immutable job snapshots, and support safe correction/versioning.
- **User-visible outcome:** users can create a job record without AI or URL retrieval.
- **Scope:** paste/file tabs, parsing reuse, metadata, immutable snapshot, archive/restore, whole-aggregate dependency preview/deletion, size/quality warnings.
- **Non-scope:** URL fetch and requirement extraction.
- **Prerequisites/dependencies:** M03, M06.
- **Likely files/subsystems:** jobs domain/API/UI, source pipeline integration.
- **Data-model impact:** JobPosting snapshot/revision and input provenance.
- **Security:** same file controls, bounded text, workspace scope, no active HTML rendering.
- **Required tests:** normalization/hash/version, allowed/hostile files, IDOR, XSS, immutable correction, atomic aggregate deletion, and accepted-document-provenance blocker.
- **Validation commands:** core/integration/contract/E2E/security gates.
- **Completion criteria:** AC-006 text/file portions pass; original/revised snapshots are reproducible.
- **Rollback/recovery:** disable input format; preserve existing immutable jobs/export. **Docs:** job pipeline/UX.

## M09 — Secure URL ingestion

**Implementation status:** Complete locally. The baseline schema and isolated no-credential fetcher implement canonicalization, all-address DNS/IP policy, TLS pinning, redirect revalidation, bounded retrieval, inert extraction, rate accounting, idempotent queueing, safe failures, and immutable snapshots. SQLite integration, isolated malicious-network SSRF fixtures, browser E2E, clean migration, supported Node 24, live portable package, security, and production-build gates pass.

- **Objective:** Implement isolated SSRF-hardened public HTTPS job retrieval and sanitized text extraction.
- **User-visible outcome:** users can import compatible public static job pages or use clear paste/upload fallback.
- **Scope:** canonicalization, DNS/IP policy, pinning, redirects, TLS, limits, HTML extraction, egress/rates.
- **Non-scope:** logged-in/dynamic/headless browser scraping, crawling.
- **Prerequisites/dependencies:** M08 and the in-process job primitives from M02.
- **Likely files/subsystems:** fetcher adapter/queue, URL UI, network fixtures.
- **Data-model impact:** safe fetch metadata/checksum/warnings on job snapshot.
- **Security:** ACASE-03/07/12 and ADR-0017 in full; proxy bypass, rebinding, mixed DNS, and metadata tests.
- **Required tests:** AC-006 URL portion; redirect/DNS/IPv4/IPv6/slow/compressed/content-type/rate cases.
- **Validation commands:** core gates plus `pnpm test:ssrf && pnpm test:security` in isolated network fixture.
- **Completion criteria:** all forbidden network cases fail before content persistence; no cookies/subresources/scripts; operator kill switch works.
- **Rollback/recovery:** disable URL feature via config; existing snapshots remain. **Docs:** URL security, deployment egress, abuse cases.

## M10 — Job requirement analysis

**Implementation status:** Complete locally. The baseline schema, deterministic/manual/AI-02 draft creation, closed-schema and exact-span validation, review/finalization, correction copy-forward, provider selection, fallback states, and UI pass SQLite integration, browser E2E, synthetic evaluation, schema-drift, security, and production-build gates.

- **Objective:** Implement AI-02 task plus manual/deterministic review for structured required/preferred qualifications, responsibilities, terms, and ambiguities.
- **User-visible outcome:** users inspect and correct source-linked job requirements.
- **Scope:** schema, source spans, requirement types/priority, immutable reviewed revisions.
- **Non-scope:** evidence ranking/tailoring.
- **Prerequisites/dependencies:** M08 and M12; manual requirement entry remains independently usable when a provider is unavailable.
- **Likely files/subsystems:** requirement domain/API/UI, task schema/evals.
- **Data-model impact:** JobRequirement with job revision, source locator, review state.
- **Security:** job injection separation, bounded context, no model output auto-authority.
- **Required tests:** AC-007, schema repair budget, source-span validation, manual fallback, injection/refusal.
- **Validation commands:** core/contract/E2E plus `pnpm test:evals --task=AI-02`.
- **Completion criteria:** invalid output never becomes reviewed requirements; corrections create immutable revision; eval threshold passes recommended model.
- **Rollback/recovery:** disable AI task and retain manual reviewed data. **Docs:** task/schema/evals/job analysis UX.

## M11 — Requirement-to-evidence matching

**Implementation status:** Complete locally. The baseline schema, append-only match runs/decisions, approved same-workspace retrieval, deterministic `lexical-evidence@1` classification, explicit gaps, lifecycle revalidation, evidence links, and evidence matrix pass SQLite integration, browser E2E, schema-drift, evaluation-smoke, and production-build gates. Optional AI-03/04 reranking remains deliberately inactive.

- **Objective:** Build deterministic candidate retrieval and matrix; optionally AI-03/04 rerank only allowed candidates.
- **User-visible outcome:** each requirement shows direct/combined/weak/no evidence and user-controlled selections.
- **Scope:** structured filters, lexical search, reasons/strength/conflicts/gaps, include/exclude.
- **Non-scope:** embeddings/vector DB, automatic claims.
- **Prerequisites/dependencies:** M04, M10; M12 for optional reranking.
- **Likely files/subsystems:** matching domain/rules/API/matrix UI, eval fixtures.
- **Data-model impact:** RequirementEvidenceMatch with method/version/strength/user decision.
- **Security:** same-workspace active facts only; model candidate subset; no content leakage.
- **Required tests:** AC-008, retrieval recall, conflict/withdrawal, cross-workspace fabricated ID, deterministic ordering.
- **Validation commands:** core/integration/E2E plus `pnpm test:evals --task=AI-03,AI-04`.
- **Completion criteria:** explicit gaps preserved; candidate leakage zero; matrix usable at 320px via list view.
- **Rollback/recovery:** remove model ranks and recompute deterministic matches; user decisions versioned. **Docs:** matching/task/IA.

## M12 — AI-provider abstraction

**Implementation status:** Complete locally. The baseline schema, encrypted write-only credentials/environment references, endpoint policy, bounded transport, OpenAI-compatible and Ollama adapters, AI-01–11 registry, schema repair/failure handling, retry/deadline/token controls, fake provider, and settings UI are implemented. Provider cards expose confirmed deletion for unused configurations while preserving configurations referenced by saved tailoring history. The recorded baseline includes SQLite integration, browser E2E, adapter contracts, evaluation smoke, security, portable package, and production-build evidence; live-provider contracts remain operator opt-in and are not a release requirement.

- **Objective:** Implement task registry, OpenAI-compatible and Ollama adapters, capability tests, encrypted credentials, schema/retry/failure framework.
- **User-visible outcome:** users configure, test, and remove unused providers; see destination/capabilities; and assign models to tasks without exposing keys.
- **Scope:** write-only credentials, confirmed unused-provider deletion, tailoring-history deletion blockers, endpoint policy, normalized refusals/usage/timeouts, fake provider, AI-01–11 contracts.
- **Non-scope:** additional provider SDKs, hosted inference, provider tools/file stores.
- **Prerequisites/dependencies:** M02, M03; enables model paths in M07/M10/M11 and M13+.
- **Likely files/subsystems:** providers infrastructure/settings, crypto envelope, task runner, contract/eval harness.
- **Data-model impact:** ModelProviderConfiguration, task manifest/attempt metadata, key version.
- **Security:** AC-022; SSRF class endpoint validation/allowlist, minimal context, redacted logs, bounded cost/retries.
- **Required tests:** adapter contracts, schema/refusal/timeout/rate/idempotency, encryption/rotation/deletion/wrong key, deletion dependency and workspace isolation, endpoint abuse, synthetic capability.
- **Validation commands:** core/security/contract/integration plus `pnpm test:evals --smoke`.
- **Completion criteria:** both adapters pass fake/live-opt-in contract; keys absent from client/log/snapshots; invalid output fails safe.
- **Rollback/recovery:** disable provider config/task; rotate/revoke credentials; manual features remain. **Docs:** provider support/secrets/eval results.

## M13 — Evidence-grounded resume tailoring

**Implementation status:** Complete locally. The baseline schema, typed run/suggestion/task/provenance storage, locks, setup disclosure, required provider-neutral AI-05/06 orchestration, career-item-grouped approved bullet/context input, hard claim validation, immutable persistence, gaps, and evidence review are implemented. Focused unit validation passes in the current change; no live-provider quality claim is made and full release gates remain M21 scope.

- **Objective:** Implement setup and AI-05/06 atomic resume suggestions with locks, requirements, claim spans, evidence validation, and explanations.
- **User-visible outcome:** users receive reviewable grounded resume changes without automatic document mutation.
- **Scope:** source version/fact selection, section/bullet operations, gaps, run manifest, lock enforcement.
- **Non-scope:** cover letters, bulk auto-accept, unsupported claims.
- **Prerequisites/dependencies:** M05, M11, M12.
- **Likely files/subsystems:** tailoring domain/API/setup/review UI, AI task/postvalidators.
- **Data-model impact:** TailoringRun, TailoringSuggestion, claim candidate and pinned inputs/versions.
- **Security:** AC-009/010/012; prompt injection, unknown IDs, metrics/dates, locked hashes, provider minimization.
- **Required tests:** supported/missing/conflicting/ambiguous evidence, injection, lock, schema, stale base, eval zero escaped unsupported.
- **Validation commands:** core/E2E/security plus `pnpm test:evals --task=AI-05,AI-06`.
- **Completion criteria:** suggestions only, complete provenance, gaps explicit, no locked mutation or unsupported suggestion reaches review.
- **Rollback/recovery:** discard runs/suggestions without changing source; revoke problematic task version. **Docs:** tailoring/provenance/prompts/flows.

## M14 — Evidence-grounded cover-letter tailoring

**Implementation status:** Complete locally. Cover-letter setup requires an eligible AI-07/08 model; planning receives approved evidence grouped by career item, drafting remains claim-covered, deterministic salutation/closing framing remains nonfactual, and shared locks/run/provenance persistence and review are implemented. Focused unit validation passes in the current change. Company/role factual prose remains deliberately non-generated because the version provenance contract has no reviewed job-span claim source.

- **Objective:** Implement AI-07/08 evidence-linked plan and paragraph suggestions using the same claim gate.
- **User-visible outcome:** users can review a grounded letter outline/draft tied to job requirements and facts.
- **Scope:** letter setup, company/role fields from reviewed job, plan review, paragraph claims, preferences/locks.
- **Non-scope:** invented contacts/salutations/company research, generic unsupported flattery facts.
- **Prerequisites/dependencies:** M13, M05.
- **Likely files/subsystems:** cover-letter task/UI templates/validators.
- **Data-model impact:** tailoring run/suggestion reuse; typed letter blocks/claims.
- **Security:** same grounding/injection/data minimization; job/company assertions require job-span evidence or remain nonfactual framing.
- **Required tests:** AC-010, missing company/contact, conflicts, claim coverage, plan/draft schema, AI-07/08 evals.
- **Validation commands:** core/E2E/security plus `pnpm test:evals --task=AI-07,AI-08`.
- **Completion criteria:** every factual letter span supported; generation is unavailable if the required provider fails, while manual document editing remains a separate non-generation workflow.
- **Rollback/recovery:** discard plan/draft suggestions; source version unaffected. **Docs:** task catalog/failure modes/letter UX.

## M15 — Editing and suggestion review

**Implementation status:** Complete locally. The baseline schema and review actions implement explicit accept/reject/edit, atomic version batches, idempotent retry, stale/lock/evidence revalidation, supported claim transfer, conservative manual-edit invalidation, remediation, and clear status inspection. SQLite integration, browser E2E, migration, and production-build gates pass.

- **Objective:** Complete production editor, atomic/group review, provenance-aware manual edits, stale handling, undo/version save.
- **User-visible outcome:** users accept/reject individual suggestions, edit freely, see support status, and recover versions.
- **Scope:** operation application transaction, claim diff mapping, link/approve-as-fact, autosave conflict UI.
- **Non-scope:** collaboration/CRDT, arbitrary HTML, template designer.
- **Prerequisites/dependencies:** M05, M13, M14.
- **Likely files/subsystems:** editor engine/UI, suggestion service, provenance mapper, version comparison.
- **Data-model impact:** decision metadata, claim/evidence snapshots, draft revisions; no mutable historical versions.
- **Security:** AC-011–015; output XSS, stale/lock bypass, cross-workspace evidence ID, concurrency.
- **Required tests:** property diff/anchors, manual factual/nonfactual edits, atomic batch, stale conflict, XSS, and end-to-end review flows.
- **Validation commands:** all core gates plus `pnpm test:e2e && pnpm test:security`.
- **Completion criteria:** AC-011–015 pass; uncertain changed claims become unverified; no silent overwrite.
- **Rollback/recovery:** version history restores content; drafts export as JSON before schema recovery. **Docs:** editor behavior/versioning.

## M16 — AI-only ATS analysis

**Implementation status:** Complete locally. AI-11 produces the full ATS estimate for saved resumes and uploaded resume sources, with or without optional reviewed job context. Closed-schema validation, immutable provider/model/task/input/output provenance, workspace-scoped UI, and focused schema/integration/browser fixtures are implemented. Historical deterministic reports remain readable but cannot be newly generated.

- **Objective:** Implement provider-backed structured AI-11 analysis, optional job context, validated category/finding output, and immutable report provenance.
- **User-visible outcome:** AI-generated parsing/content estimate and, when selected, job alignment with rationales, remediation, model provenance, and limitations.
- **Scope:** saved resumes, parsed resume uploads, job/no-job contexts, schema validation, idempotent input reuse, provider disclosure.
- **Non-scope:** proprietary ATS emulation, hiring prediction, deterministic fallback scoring, or AI authority over grounding/export.
- **Prerequisites/dependencies:** M10, M12, M15.
- **Likely files/subsystems:** ATS AI service/schema/repository/report UI/provider task framework.
- **Data-model impact:** ATS reports/categories/findings plus provider/model/task/attempt/input/output provenance.
- **Security:** bounded delimited hostile input, closed output schema, content-free logs/audit metadata, no protected-class/prestige judgments, no grounding/export authority.
- **Required tests:** AC-016/017; job/no-job schemas, provider assignment, hostile input separation, persistence, hash rechecks, workspace isolation, UI limitations.
- **Validation commands:** core gates plus `pnpm test:ats`.
- **Completion criteria:** AI-11 is the sole generation path; both contexts pass schema/service/integration tests; reports disclose AI provenance and limitations.
- **Rollback/recovery:** immutable reports pin task/model/input/output versions; disable AI-11 generation without affecting grounding/export. **Docs:** ATS methodology/output contract/fixtures/limitations.

## M17 — Export pipeline

**Implementation status:** Complete locally. The baseline schema, private expiring artifacts, strict evidence final gate, remediation responses, bounded PDF, macro-free DOCX, labeled text formats, bounds, authorization, hash verification, and ≥98% ordered parse-back pass export, SQLite integration, browser E2E, clean migration, and production-build gates.

- **Objective:** Implement safe PDF, DOCX, Markdown, text, JSON exporters, final gate, private artifacts, parse-back/visual validation.
- **User-visible outcome:** users download readable final supported documents or explicitly labeled permitted drafts.
- **Scope:** fixed templates, networkless render, format options, artifact expiry/save.
- **Non-scope:** arbitrary templates, pixel-identical imported layout, draft PDF/DOCX.
- **Prerequisites/dependencies:** M15; integrates M16 parse-back.
- **Likely files/subsystems:** renderers/templates/export service/artifacts/export UI/tests.
- **Data-model impact:** ExportArtifact and manifest/expiry/template/renderer metadata.
- **Security:** AC-015/019; escape/sanitize, no network/scripts, resource limits, authorized attachment, malicious template/content.
- **Required tests:** text equivalence, PDF/DOCX parse/open, snapshots/overflow/Unicode, injection/remote asset, final blocker, cleanup.
- **Validation commands:** core gates plus `pnpm test:exports && pnpm test:e2e`.
- **Completion criteria:** AC-019 and OQ-02 decision; supported fixtures meet text and structural fidelity thresholds; final gate cannot bypass.
- **Rollback/recovery:** disable affected format; delete partial objects; canonical versions remain. **Docs:** exporter/library limitations/deployment fonts.

## M18 — Settings, privacy, and data portability

**Implementation status:** Complete locally. Versioned allowlisted JSON export/import, optional bytes, provider-secret exclusion, relational/provenance validation, transactionally repeated dry-run conflicts, privacy UI, source-unavailable markers, card-level and selected-group archive/delete confirmations, full write freeze, content-free tombstones/receipts, synchronous deletion, and startup/recurring replay maintenance are implemented. SQLite round-trip/deletion, focused card-action browser coverage, clean migration, restore-ledger replay, and portable-package gates provide the recorded baseline evidence; current-run evidence must still be reported separately.

- **Objective:** Complete settings, task defaults/disclosures, archive export/import preview, record/source/workspace deletion and receipts.
- **User-visible outcome:** users control providers/privacy, export all portable data, and permanently delete scoped/all data.
- **Scope:** versioned archive, conflict/dry-run, secret exclusion, retention display, binary-only deletion, durable delete job.
- **Non-scope:** external-provider deletion automation, cross-instance sync, account transfer.
- **Prerequisites/dependencies:** M04-M17, especially storage, jobs, and local identity.
- **Likely files/subsystems:** settings/portability/deletion domains/UI/archive schemas.
- **Data-model impact:** export/import/deletion operation, tombstones/receipts; cascades finalized.
- **Security:** explicit destructive confirmation, path/archive validation, no secret plaintext, freeze/verify/orphan scan/tombstone replay.
- **Required tests:** AC-020–022; round-trip/dry-run/conflicts, partial outage/retry/concurrent write/restore/cross-workspace.
- **Validation commands:** all core/security/E2E plus `pnpm test:portability && pnpm test:deletion`.
- **Completion criteria:** active erase is attempted immediately and durably retried; the reported app-managed backup window is zero because no backup is created; round trip passes; secrets are absent; deletion drill passes.
- **Rollback/recovery:** deletion cannot be undone after active erase; restore only a user-provided export or coordinated physical copy carrying the newest deletion ledger; failed operations safely resume. **Docs:** privacy/retention/data lifecycle/user-controlled backup.

## M19 — Security hardening

**Implementation status:** Complete locally. Per-request nonce CSP, browser headers, loopback/origin checks, bounded bodies, rate limits, redacted identifiers, secret/static-danger scanning, load smoke, audit, and release checks are implemented. Security/SSRF, SQLite abuse/concurrency, browser CSP, package load, and production-build gates pass locally. Remote CodeQL execution is optional publication evidence when maintainer repository permissions support it, not an automatic local product blocker.

- **Objective:** Close the threat model with abuse tests, quotas/rates, CSP/headers, local runtime/package hardening, SCA/secrets/SAST, and remediation.
- **User-visible outcome:** safer defaults and clear recoverable security errors without leaked details.
- **Scope:** ACASE-01–12, dependency/runtime review, permissions, egress, and content-free audit events.
- **Non-scope:** formal certification, penetration-test guarantee, host-root defense.
- **Prerequisites/dependencies:** M01–M18 feature complete.
- **Likely files/subsystems:** all trust boundaries, security CI/fixtures/docs.
- **Data-model impact:** indexes/quotas/audit fields only; migration security reviewed.
- **Security:** entire milestone; critical/high reachable findings block.
- **Required tests:** AC-024; threat/abuse matrix, load/resource, log/secret snapshots, dependency/runtime scan, and package inspection.
- **Validation commands:** full gates plus `pnpm security:check && pnpm test:security && pnpm test:load`.
- **Completion criteria:** every threat has passing evidence/residual note; no unexpired critical/high exception; incident process exercised.
- **Rollback/recovery:** feature kill switches and previous compatible local binary; never roll back a security migration into exposure. **Docs:** threat/risk/security policy.

## M20 — Responsive hardening

**Implementation status (2026-07-11):** Revalidation in progress. Static narrow-layout, long-content, contrast, focus, extraction-bounding, and error-state defects found by the codebase audit have been remediated. The explicit 320–1536 px rendered/keyboard matrix must be rerun before this milestone is claimed complete.

- **Objective:** Validate and remediate every major screen for supported desktop and narrow browser layouts.
- **User-visible outcome:** core workflows remain usable on narrow screens and with long content or error messages.
- **Scope:** responsive layout, mobile/list alternatives, overflow handling, editor and export presentation.
- **Non-scope:** native apps, unsupported legacy browsers, or formal conformance certification.
- **Prerequisites/dependencies:** M03–M18 UI complete; security controls from M19 included.
- **Likely files/subsystems:** design system, components, screens, templates, and browser tests.
- **Data-model impact:** none.
- **Security:** destructive-action confirmations remain visible at every supported width.
- **Required tests:** 320 px browser flows, long-content and error-state layout, export preview, and desktop regression checks.
- **Validation commands:** `pnpm test:e2e && pnpm test:exports` plus core gates.
- **Completion criteria:** no blocker layout defect on a core workflow; OQ-07 remains resolved.
- **Rollback/recovery:** revert the layout regression while preserving API/data behavior. **Docs:** design and known format limits.

## M21 — End-to-end and recovery validation

**Implementation status (2026-07-11):** Audit revalidation in progress. The pre-remediation baseline passed clean SQLite deployment, portable-package startup/restart/persistence, parser/fetch/deletion recovery, 11-scenario browser E2E, package smoke/personal tests, static/security/domain gates, local production load, and build. Migration `0002_integrity_guards.sql` now adds current-version/context checks, immutable-history delete guards, storage-key validation, and frozen-workspace delete guards without rewriting the baseline. All gates and package/recovery evidence must be rerun after remediation before this milestone is complete.

- **Objective:** Exercise release-scale clean install, all user journeys, concurrency/faults, performance, upgrade/restore/delete replay, and traceability.
- **User-visible outcome:** documented repeatable workflows survive expected failures without lost or leaked data.
- **Scope:** AC-001–027, provider outage, parser crash, process/maintenance restart, storage/database disruption, performance budgets.
- **Non-scope:** unbounded scale/HA certification.
- **Prerequisites/dependencies:** M01–M20.
- **Likely files/subsystems:** E2E/fault/load fixtures, portable package, migration/backup scripts, docs checker.
- **Data-model impact:** validate rather than redesign; defects return to owning milestone.
- **Security:** tenant/deletion/secret/SSRF/injection scenarios in integrated deployment.
- **Required tests:** full test strategy, clean host, upgrade N-1, backup/restore+tombstones, idempotency, performance AC-026, traceability AC-027.
- **Validation commands:** every command in `QUALITY_GATES.md`, clean portable-package smoke, documented restore drill.
- **Completion criteria:** all AC evidence linked; no flaky release gate; budgets pass or dated accepted noncritical exception.
- **Rollback/recovery:** exercise the previous compatible package and verified coordinated copy; record RTO observations. **Docs:** all current-state/operations/risks.

## M22 — Local MVP release

**Implementation status (2026-07-03):** In validation after the SQLite/no-account transition. The Windows x64 ZIP builds with bundled Node 24.18.0; final extracted launch/restart/persistence and complete gate evidence are still required before release-ready status.

- **Objective:** Produce the first documented, reproducible MIT-licensed local-only release package.
- **User-visible outcome:** a user extracts a ZIP, starts the tool without an account or prerequisite service, keeps data locally, and can stop, back up, upgrade, or restore it.
- **Scope:** Windows x64 portable package, source archive, notices, checksums, changelog, support/security versions, and local-data guide.
- **Non-scope:** remote hosting, accounts, containers, Kubernetes/HA, SaaS, or automatic publication.
- **Prerequisites/dependencies:** M21 and every M01-M20 completion criterion.
- **Likely files/subsystems:** package/launcher scripts, release CI, release docs/metadata; no new product feature.
- **Data-model impact:** freeze/review migration, archive, ruleset, and AI-task schema versions.
- **Security:** pinned runtime/dependencies/actions, checksums, scans, secret checklist, loopback-only bind, clean archive, and no accepted exploitable critical/high issue.
- **Required tests:** clean first start without installed Node, no-provider startup, ready/health, stop/start persistence, package-content inspection, backup/restore, rollback, and primary browser smoke.
- **Validation commands:** every command in `QUALITY_GATES.md`; `scripts/personal/package.ps1`; extracted launcher start/status/stop/restart checks with isolated `VITAE_DATA_DIR`; checksum verification.
- **Completion criteria:** all acceptance criteria pass; the extracted ZIP is self-contained and preserves data; documentation states supported platform/limits; no account or proprietary hosted service is required.
- **Rollback/recovery:** mark an affected release, publish a fixed version, and restore the prior binaries plus coordinated pre-upgrade data-folder copy. **Docs:** readiness, release notes, security support, and roadmap.

## Critical path and parallel work

Critical path: **M01 → M02 → M03 → M04 → M05 → M06 → M08 → M10 → M11 → M13 → M14 → M15 → M16 → M17 → M18 → M19 → M20 → M21 → M22**, with **M12 starting after M03 and joining before M10**. M07 is required for release but can run beside M08/M10 once M06 and M12 finish. M09 is required before release but can run beside M10 after M08. After M05, parser work and editor design can overlap. After M15, ATS (M16) and export foundations (M17) can overlap, then integrate. Documentation, threat modeling, and fixtures are continuous work, not final-stage additions.
