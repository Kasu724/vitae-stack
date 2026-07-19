# Vitae Stack Codebase Audit

## Audit status

- **Status:** Complete
- **Audit date:** 2026-07-11
- **Scope:** Entire repository, authoritative documentation, application/UI routes, APIs/actions, domain and infrastructure modules, database/migrations, security/privacy controls, tests, production runtime, and downloadable Windows package
- **Disposition:** All 29 confirmed findings are fixed in the working tree and verified. Residual product limitations are documented below; none is an unrecorded implementation blocker.
- **Execution ledger:** See [CODEBASE_AUDIT_PROGRESS.md](CODEBASE_AUDIT_PROGRESS.md).

## Executive summary

Vitae Stack is a coherent privacy-first local application with strong architectural foundations: a strict-TypeScript modular monolith, one loopback-only process, SQLite plus private filesystem artifacts, explicit immutable evidence, provider-backed AI ATS analysis, and repository-owned PDF/DOCX renderers. The pre-remediation repository already had broad happy-path tests, but the audit found two critical factual-safety flaws, four high-severity runtime/recovery flaws, numerous UI/documentation gaps, and additional relational/package integrity issues that existing gates did not expose.

The two critical flaws were executable, not theoretical. A portable archive could omit claim coverage and still create a `final` binary artifact, and the former 35% lexical-overlap rule accepted a longer claim containing an unrelated fabricated credential. Both paths now use one exact, fail-closed grounding contract. Current ATS and final artifact generation/download reassess structural coverage, claim hashes/offsets, evidence approval/entry lifecycle, and exact assertion support. Missing or stale grounding blocks final output.

Runtime and privacy boundaries were also hardened. Source commands and personal launchers bind `127.0.0.1`; Proxy now evaluates prefetch requests; real production probing returned 403 for a hostile Host with `Purpose: prefetch`. Provider and job-fetch transports enforce absolute wall-clock deadlines. Deletion requests are durably tombstoned, recovered at startup/maintenance intervals, retried, and completed without creating a managed backup. SQLite integrity migration 0002 adds contextual, immutable-history, canonical-storage, and frozen-workspace guards.

The final repository passes every applicable gate, a 136-check core responsive/accessibility route matrix, hostile dynamic-route checks, a production load/listener probe, and extracted-package start/stop/restart/persistence verification. The final Windows ZIP checksum is `12b43d8446d3cf0f7ff252dc9e5cf1a14a86940087b33ad793e63c4cc94c3f4b`.

## Product, users, and architecture

Vitae Stack serves job seekers who want local, inspectable career-document tooling without surrendering career history to a hosted account. Users enter or import career history, explicitly approve immutable evidence, review job requirements, select evidence, inspect generated suggestions, remediate unsupported claims, optionally run an AI ATS estimate with or without job context, and export only after the independent factual-safety gate passes.

The delivered topology is a local-only Windows x64 package with bundled Node.js 24.18.0, one Next.js 16 process bound to loopback, one SQLite file, and sibling private artifact/queue directories. Optional Ollama or OpenAI-compatible providers are explicit opt-ins. Public job-page retrieval is HTTPS-only and SSRF constrained. No account, database server, container runtime, telemetry service, or proprietary provider is required.

The application is a modular monolith. Next.js owns HTTP/UI boundaries; domain modules own career evidence, sources/extraction, jobs/requirements/matching, provider tasks, tailoring, documents/provenance, ATS, exports, portability, and deletion. Workspace identifiers remain an authorization boundary even in trusted-local mode. Immutable facts, document versions, reviewed analyses, matching/tailoring history, ATS reports, and artifact manifests are protected by repository rules and database triggers.

## Audit scope and method

The audit reviewed:

- Root instructions, package/toolchain configuration, workflows, release launchers, security/license/notices, and all 114 repository Markdown files.
- All 21 page routes, 10 UI-facing API routes, server-action modules, client components, styles, Proxy, and runtime instrumentation.
- Every domain/infrastructure family under `src`, both migrations, all scripts, and all unit/integration/contract/specialized/browser tests.
- Real listener/HTTP behavior, production load, local deletion/recovery, hostile files/text/URLs/archives, concurrency races, responsive reflow, keyboard/focus behavior, and the final extracted package.

The audit used static trust-boundary tracing, executable negative tests, direct SQLite probes, browser DOM/layout assertions, normal viewport screenshots, production HTTP requests, artifact parse-back, and package extraction/restart. Pre-existing user modifications were recorded before remediation and preserved.

## Baseline versus final evidence

| Area                     | Pre-remediation baseline                        | Final evidence                                                                                                  |
| ------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Unit tests               | 21 files / 66 tests                             | 24 files / 81 tests                                                                                             |
| Integration tests        | 11 files / 38 tests                             | 11 files / 44 tests                                                                                             |
| Database                 | 1 migration / 46 tables / 112 triggers          | 2 migrations / 46 tables / 180 triggers                                                                         |
| Documentation gate       | 16 tracked Markdown files                       | 114 repository Markdown files plus normative traceability checks                                                |
| Browser journeys         | 11 E2E at desktop default                       | 13 E2E, 2 smoke, 2 personal; isolated per run                                                                   |
| Responsive/accessibility | Claimed but not evidenced                       | 136 core checks at eight viewports plus hostile dynamic-route checks                                            |
| Production load          | 281 ms p95                                      | 205 ms p95, 200 requests, concurrency 20, zero failures                                                         |
| Runtime authority        | Wildcard listener; prefetch bypass returned 200 | Loopback listener; hostile prefetch request returned 403                                                        |
| Package                  | Existing happy-path build                       | Fail-safe traced-data detection, corrected rebuild, checksum, forbidden-path inventory, two starts, persistence |

## Findings and dispositions

### Critical

#### AUD-001 - Portability import bypassed the final-export grounding gate

- **Status:** Fixed
- **Evidence:** A schema-valid imported resume containing an unsupported degree and zero claim rows produced a `final` PDF because export trusted the absence of blockers.
- **Root cause:** Import validated outer shape but not relational/coverage semantics; export assumed claim rows were complete.
- **Remediation:** `src/modules/documents/grounding.ts` now provides complete structural coverage and lifecycle assessment. Portability validates UUIDs, relationships, document hashes/coverage, storage identity, context, schemas, blobs, and apply-time target state. Export generation and download independently reassess the current document/evidence state, pin policy/state hashes, verify manifest/hash/size, and parse back the artifact.
- **Verification:** `tests/unit/document-grounding.test.ts`, portability-to-export and stale-artifact integration regressions, export/ATS suites, and the primary E2E journey pass.

#### AUD-002 - Lexical overlap accepted unrelated unsupported clauses as grounded

- **Status:** Fixed
- **Evidence:** `Built secure systems for clients and earned a PhD from MIT.` passed against evidence containing only the first clause.
- **Root cause:** A relevance heuristic was used as an entailment gate in both tailoring and manual linking.
- **Remediation:** All hard grounding paths share `exact-approved-assertion@1`: NFKC/whitespace-normalized exact direct assertions or bounded exact combinations only. Unsupported additions, entities, degrees, employers, roles, dates, metrics, negation, or uncertain paraphrases fail closed to explicit evidence review.
- **Verification:** Shared grounding tests cover direct/combined support, added credentials/entities, numeric preservation, hash/offset/overlap/coverage, lifecycle changes, manual linking, tailoring, ATS, and export.

### High

#### AUD-003 - Source startup listened on all interfaces without authentication

- **Status:** Fixed
- **Remediation:** `dev` and `start` scripts and personal launchers pass/bind `127.0.0.1`; docs match the executable boundary.
- **Verification:** Production listener was exactly `127.0.0.1`; valid dashboard request returned 200; package listener was loopback before and after restart.

#### AUD-004 - Prefetch headers bypassed trusted-local Proxy and CSP

- **Status:** Fixed
- **Remediation:** Prefetch `missing` matcher exclusions were removed so every application/API request crosses authority validation and security-header logic.
- **Verification:** Security tests cover prefetch headers; real built-server request with hostile Host plus `Purpose: prefetch` returned 403.

#### AUD-005 - Deletion replay/retry/cleanup had no production caller

- **Status:** Fixed
- **Remediation:** Content-free bounded maintenance runs at startup and recurring safe intervals; tombstones are strictly parsed and reconciled; stale/failed operations retry; expired/orphan artifacts are cleaned; deleted/frozen principals fail closed; no managed backup is created.
- **Verification:** Faulted deletion, corrupt tombstone, restart/replay, lease/retry, cleanup, concurrent-maintenance, and extracted restart tests pass.

#### AUD-006 - Provider and job-fetch total deadlines were inactivity timeouts

- **Status:** Fixed
- **Remediation:** Both transports enforce absolute wall-clock deadlines across DNS, connect, redirects, headers, and streaming bodies while retaining byte/redirect bounds.
- **Verification:** Drip-response security regressions pass for provider and public job fetch.

#### AUD-024 - Database history/context/frozen-workspace guards were incomplete

- **Status:** Fixed
- **Evidence:** Raw SQL could delete immutable document history, create cross-context current pointers, or delete records from a frozen workspace.
- **Remediation:** `0002_integrity_guards.sql` adds immutable DELETE, contextual parent/current, history, extraction, tailoring, ATS, storage-identity, and frozen INSERT/UPDATE/DELETE triggers. Authorized deletion uses a narrow connection-local function.
- **Verification:** Database integration tests reject raw immutable deletion, cross-context current versions, and frozen deletes while authorized workspace deletion succeeds.

#### AUD-025 - Portability allowed poisoned identities, cross-context graphs, and apply-time races

- **Status:** Fixed
- **Evidence:** Malformed source IDs could poison storage/deletion; a tailoring run could mix a job revision and requirement set; a target write after preview could race import.
- **Remediation:** Generic UUID/composite-key checks, full graph/context validation, canonical storage keys, unknown-column rejection, immutable input snapshotting, blob staging, and a second semantic/schema/emptiness/conflict check under the same `BEGIN IMMEDIATE` transaction.
- **Verification:** Poisoned source, crossed tailoring context, malformed schema, duplicate/composite identity, concurrent target write, cleanup, and valid round-trip regressions pass.

### Medium

#### AUD-007 - Authoritative documentation was ignored and absent from checks

- **Status:** Fixed
- **Remediation:** Docs are no longer ignored. `docs:check` enumerates tracked plus unignored repository Markdown, requires authority files, checks every PR/AC traceability row, links, fences, stale markers, current migration references, threat IDs, and required quality gates.
- **Verification:** 114 Markdown files pass.

#### AUD-008 - One rejected autosave poisoned the editor queue

- **Status:** Fixed
- **Remediation:** The queue recovers after failure, reports safe retry state, and only clears dirty state when the saved snapshot still matches current content.
- **Verification:** Network-failure-then-retry unit regression passes.

#### AUD-009 - Stale editor conflicts lacked preserve/compare/reapply controls

- **Status:** Fixed
- **Remediation:** A 409 response includes the current server draft/version under a no-store contract. Saving pauses; local/server block text is compared side by side; the user explicitly chooses the server draft or overwrites the reviewed mutable server draft with local content. Immutable history remains intact.
- **Verification:** DOM unit tests assert pause/disable, comparison, explicit reapply, updated base/revision, and successful retry.

#### AUD-010 - Deletion UI misreported rejected requests and nonexistent recovery

- **Status:** Fixed
- **Remediation:** UI distinguishes rejected requests from accepted frozen operations, reads route `code` and operation `errorCode`, describes the exact managed scope, states that no backup is created, and warns that external copies remain outside app control.
- **Verification:** Invalid-confirmation E2E exposes `CONFIRMATION_REQUIRED` and never claims deletion; browser verification also surfaced `UNTRUSTED_ORIGIN` accurately.

#### AUD-011 - Extraction review could render an unbounded source/proposal DOM

- **Status:** Fixed
- **Remediation:** Source text renders once in a bounded scrollable `<pre>`; proposals are paginated 25 per page; confirmed bulk approval/rejection supports visible-page or all-pending selection; hostile long strings wrap.
- **Verification:** Three pages containing 60 proposals, prompt-injection strings, script/image payload text, and a 4,999-character token passed 12 hostile viewport checks with no overflow or execution.

#### AUD-012 - Career form validation failures escaped as server errors

- **Status:** Fixed
- **Remediation:** Career entry and fact forms use typed action state, field-linked errors, focusable summaries, preserved values, strict partial-calendar validation, date-order/current rules, and conditional metric requirements. A domain refinement no longer throws after an earlier parse failure.
- **Verification:** Unit cases cover invalid calendar/order/current and incomplete metrics; E2E verifies every career field remains after invalid submit and the summary is focused.

#### AUD-013 - Tailoring review defaulted every suggestion to Reject

- **Status:** Fixed
- **Remediation:** Required Accept/Reject radios begin unchecked; commit cannot proceed until every suggestion receives an explicit decision.
- **Verification:** Browser check found zero checked radios, six required invalid radios, unchanged URL/state, and focus on the first missing decision.

#### AUD-014 - AI-02 lacked a provider transmission preview

- **Status:** Fixed
- **Remediation:** Job analysis shows provider label, assigned model, origin, task/data class, full normalized job snapshot boundary, instructions/schema disclosure, excluded career/evidence/draft classes, and remote retention/training warning before transmission.
- **Verification:** Seeded provider-ready job displayed every disclosure and destination/model; visual desktop review passed.

#### AUD-015 - Portability/deletion controls mishandled failures and duplicate activation

- **Status:** Fixed
- **Remediation:** One `busyRef` serializes operations immediately; controls disable while pending; all fetch/JSON failures return actionable non-success state; import preview focus and deletion acceptance state are explicit.
- **Verification:** E2E archive/dry-run and deletion-error flows pass; browser matrix found no duplicate IDs or unlabeled controls.

#### AUD-016 - Form-control borders failed non-text contrast

- **Status:** Fixed
- **Remediation:** Light/dark border tokens, action text, focus rings, disabled state, and control sizing were revised for clear contrast and operability.
- **Verification:** Computed keyboard focus was a solid 3 px-equivalent action-color outline with offset; final matrix found no undersized targets.

#### AUD-017 - Unbroken user strings overflowed narrow layouts

- **Status:** Fixed
- **Remediation:** Global prose/navigation/heading wrapping, grid `min-w-0` fixes, bounded preformatted content, extraction label wrapping, and document-lock grid corrections were added.
- **Verification:** A 200-character title and hostile 4,999-character content fit at 320 px; final 136-check matrix had zero overflow.

#### AUD-018 - Saved provider task assignments were invisible

- **Status:** Fixed
- **Remediation:** Provider cards display available status and every saved task/model assignment; assignment controls expose AI-01 through AI-11.
- **Verification:** Browser readback showed `AI-02: synthetic-ai02` and the complete task registry.

#### AUD-019 - Responsive/accessibility claims lacked browser evidence

- **Status:** Fixed
- **Remediation:** E2E now uses a fresh isolated runtime root per invocation and adds invalid-form/deletion-code regressions. The audit executed all major routes and dynamic hostile states at the specified viewports plus 320 px.
- **Verification:** 136 core checks, 28 dynamic checks, 12 hostile rechecks, screenshots, keyboard/form state checks, and an empty browser warning/error log.

#### AUD-026 - Readiness accepted unknown/fake migration state

- **Status:** Fixed
- **Remediation:** Migration runner rejects applied versions absent from the bundle. Readiness requires the exact version/checksum set, critical schema objects, foreign keys, `quick_check`, and `foreign_key_check`.
- **Verification:** Fake/unknown/checksum/missing-trigger/corruption unit and integration cases pass.

#### AUD-027 - Stale provider capability results could certify a rotated credential

- **Status:** Fixed
- **Remediation:** Capability recording uses the configuration revision as a compare-and-swap precondition; rotation increments revision and invalidates prior certification.
- **Verification:** Integration regression proves an in-flight old capability result cannot mark the rotated credential available.

#### AUD-028 - Standalone tracing could copy local data into a release

- **Status:** Fixed
- **Evidence:** A late package build failed closed because traced output contained `app/tmp` with synthetic test data.
- **Remediation:** Trace exclusions were normalized and the standalone copy boundary independently skips `node_modules`, `.release`, `dist`, `tmp`, `var`, and `.vitae-stack`; final validation still rejects any forbidden path.
- **Verification:** Final package built, checksum matched, and extracted forbidden-path count was zero.

#### AUD-029 - Browser gates reused a persistent default database

- **Status:** Fixed
- **Evidence:** Repeated local E2E runs accumulated immutable synthetic history and made later archive/deletion scenarios order-dependent.
- **Remediation:** Playwright creates a fresh runtime root with database, artifacts, parser queue, and fetch queue per run unless an external deployment or explicit database is supplied.
- **Verification:** Clean rerun passed all 13 E2E tests in 48.7 seconds; smoke/personal and external package runs also pass.

### Low

#### AUD-020 - Current-state docs contradicted implemented architecture/evidence

- **Status:** Fixed
- **Remediation:** Current docs now describe local SQLite/no-account runtime, actual APIs/jobs/observability/lifecycle/backup behavior, ATS rules 1.1, current migrations, real test workflows, UI behavior, and complete PR-001–029 / AC-001–027 traceability. Superseded ADR bodies remain clearly historical.
- **Verification:** Full documentation review and 114-file docs gate pass.

#### AUD-021 - Evaluation and full-gate commands were inconsistent

- **Status:** Fixed
- **Remediation:** Shared argument parsing supports `--task AI-02` and `--task=AI-02`, comma lists, deduplication, smoke mode, and fail-closed unknown/malformed input. Quality-gate docs distinguish CI, local production load, package, and browser checks.
- **Verification:** Parser unit tests plus smoke and filtered AI-02 eval runs pass.

#### AUD-022 - Documented development storage differed from runtime defaults

- **Status:** Fixed
- **Remediation:** `.env.example`, README, launchers, and operations docs consistently use `./var/vitae.sqlite` and `./var/private/*` roots.
- **Verification:** Docs/config comparison and package runtime inspection pass.

#### AUD-023 - Contributor guidance said implementation did not exist

- **Status:** Fixed
- **Remediation:** Contributor guidance now describes the working local MVP, authority order, release hardening, tests, privacy boundaries, and evidence requirements.
- **Verification:** Docs review/check pass.

## Documentation-to-implementation reconciliation

Current-state documents now match the implementation on these previously contradictory points:

- SQLite baseline 0001 plus integrity migration 0002; no fictitious per-feature migrations.
- No account/session/reauth/onboarding boundary in the personal release.
- No Docker/PostgreSQL/operator backup or hosted telemetry in the supported topology.
- Content-free local readiness/audit logging rather than an unimplemented metrics/support-bundle stack.
- No managed backup during deletion; user portability/manual copies are the recovery path.
- Synchronous bounded PDF/DOCX rendering and closed-schema AI-11 ATS analysis.
- Actual API authority/origin enforcement, provider disclosure, pagination, responsive behavior, and CI/package gates.
- Explicit PR/AC-to-milestone/test evidence for every normative identifier.

## Security and privacy conclusions

The final trust-boundary review found no remaining confirmed route to a `final` career artifact containing unsupported factual material. Final export and download both reassess current evidence and artifact integrity. ATS remains an estimate and uses the same current grounding assessment. Portability preserves immutable historical claim labels when later policy/lifecycle changes make them ineligible; it never confers final-export eligibility.

Local-only is a deployment boundary, not authentication. Loopback binding, Host/forwarded-authority checks, CSP/security headers, no telemetry, private storage, content-free logs, encrypted provider credentials, endpoint allowlists, SSRF controls, and package data-root exclusions provide layered protection. Anyone with access to the operating-system account or local data folder can still access the workspace; that is an explicit residual boundary.

Deletion is a product flow: request, freeze, tombstone, bounded processing, retry/replay, managed-record/file removal, and content-free receipt. The app creates no backup and cannot delete exports, filesystem snapshots, synced copies, or manual backups outside its managed root.

## Accessibility and UI/UX conclusions

All core/dynamic audited pages contain one `main` and one `h1`, valid heading progression, labeled controls, valid ARIA references, unique IDs, sufficient target sizing, visible focus, and no horizontal page overflow at the audited widths. Error summaries take focus and link to invalid fields; invalid values remain available for correction. Destructive operations use explicit phrases and accurate scope/copy. Tailoring decisions are explicit, provider destinations are visible, and hostile imported text remains visibly inert.

The audit used Chromium and programmatic DOM/computed-style checks; it did not substitute for a manual screen-reader study across every assistive technology/browser combination. That remains a release-quality enhancement, not a confirmed defect.

## Performance and reliability conclusions

- AI-11 provider latency is endpoint/model dependent and reported separately from local performance.
- PDF p95: 983 ms; DOCX p95: 60 ms.
- Production HTTP load: 205 ms p95, 200 requests, concurrency 20, zero failures.
- Parser/source/job/provider inputs retain byte, text, redirect, and absolute-time bounds.
- Extraction review is page/viewport bounded.
- SQLite readiness performs exact migration and integrity checks.
- Mutable editor/import/provider operations use optimistic revision or transactional compare-and-swap protection.
- Package start, stop, restart, database migration, and marker persistence passed with the bundled runtime.

## Final verification summary

The final passing matrix includes format, lint, typecheck, unit, integration, contract, eval smoke/filtered, parsers, ATS, exports, portability, deletion, security, SSRF, performance, production load, E2E, smoke, personal, build, database, documentation, notices, production dependency audit, real listener/Host probing, and Windows package build/extraction/restart/persistence. Exact counts and timings are in the progress record.

## Residual risks and limitations

- ATS results are AI-generated estimates, not compatibility guarantees for a named employer system or hiring predictions.
- Optional remote providers control their own retention/training/security; the UI discloses destination/model/data before use, but this audit did not send data to live third-party services.
- The no-account personal model assumes the operating-system user and local machine are trusted. It is not suitable for LAN/public binding.
- Immutable historical claims may fail a newer grounding policy or later evidence lifecycle. Portability preserves that history; current ATS/export gates reassess it and block ineligible output.
- The app intentionally creates no telemetry service and no managed backup. Users must make and protect external copies themselves.
- The release package was fully validated on Windows x64. Source-mode shell scripts are checked/tested, but no separate Linux/macOS binary bundle is claimed.
- Browser coverage is Chromium-based; broader browser and assistive-technology matrices can improve confidence further.

## Prioritized future improvements

No confirmed audit finding remains open. Sensible non-blocking follow-ups are broader assistive-technology/browser coverage, optional automated cleanup of per-run ignored test roots, richer user-facing portability warnings for historical grounding-policy changes, and continued dependency/provider endpoint review before each release.

## Final completion audit

- [x] All requested documentation and repository areas reviewed.
- [x] Every initial and deep-audit finding has a disposition, remediation, and evidence.
- [x] Critical factual-safety invariants are centralized and enforced at final boundaries.
- [x] Authorization, network, deletion, storage, migration, concurrency, and package abuse cases are covered.
- [x] UI/accessibility/responsive/error/hostile states are rendered and tested.
- [x] All applicable gates pass after remediation.
- [x] Production listener/load and downloadable package restart/persistence pass.
- [x] Pre-existing user changes were preserved; no unrelated destructive Git operation was used.
- [x] Residual limitations are explicit and do not contradict implemented behavior.

The audit is complete.
