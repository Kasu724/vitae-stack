# Acceptance criteria

These criteria are normative. `Given/When/Then` examples complement, rather than replace, the numbered product requirements. Test IDs map in [traceability](../exec-plans/REQUIREMENTS_TRACEABILITY.md).

## Career data and ingestion

- **AC-001:** Given two workspaces with similarly named entries, API/UI queries authenticated to A return zero IDs, metadata, counts, search snippets, artifacts, or timing-distinguishable existence errors from B.
- **AC-002:** Given an extracted fact, it is absent from eligible generation inputs until the user approves it; approval records actor, time, normalized value, source locator, and immutable evidence ID.
- **AC-003:** Changing approved fact F creates F2 with `supersedes=F`; old versions retain F provenance, new generation excludes F, and audit history contains no sensitive value.
- **AC-004:** PDF, DOCX, Markdown, text, and compatible JSON fixtures import within limits; spoofed signatures, macros/active content, encrypted documents, oversized input, and decompression-bomb fixtures fail safely before parsing.
- **AC-005:** Extraction review exposes every proposal with source locator and supports approve, edit-then-approve, reject, and duplicate merge; bulk approval requires an explicit summary confirmation.
- **AC-006:** Job text/file input stores a normalized immutable snapshot. URL input rejects non-HTTPS (unless explicit development override), credentials, private/reserved/loopback/link-local addresses, unsafe redirects, excess bytes/time/redirects, and unsupported content types.
- **AC-007:** Requirement extraction output failing its schema is never persisted as accepted data; at most two bounded repair attempts occur, after which the user can retry or enter requirements manually.

## Grounding, tailoring, and editing

- **AC-008:** Each evidence match shows requirement, evidence IDs, source summary, deterministic signals, optional model rank, and strength; requirements with no evidence remain explicit gaps.
- **AC-009:** Tailoring request payload contains only selected approved non-withdrawn facts, chosen job snapshot, preferences, and locked-content hashes; logs contain none of their text.
- **AC-010:** Any generated factual claim citing a nonexistent, unselected, withdrawn, conflicting, or semantically unrelated evidence ID is rejected before it reaches the document.
- **AC-011:** Every visible suggestion has a single reviewable operation, base-version precondition, rationale, affected requirement IDs, evidence IDs, and before/after text; stale-base acceptance is rejected with a rebase choice.
- **AC-012:** Locked sections and fact spans remain byte-equivalent after a tailoring run; an attempted provider change is discarded and surfaced as a blocked suggestion.
- **AC-013:** Accepting suggestions creates exactly one new version per review commit; rejecting creates no content version; retrying an idempotency key creates no duplicate run/version.
- **AC-014:** Editing a supported factual span changes its status to `unverified` unless deterministic span mapping proves it unchanged. The editor offers link-to-evidence or approve-as-new-fact; unsupported spans remain visually and programmatically identified.
- **AC-015:** Final PDF/DOCX export returns a machine-readable 409 plus actionable remediation links when any factual claim is not supported. A draft Markdown/text/JSON export, if chosen, carries an explicit draft/unsupported manifest and visible header where format permits.

## ATS, versions, export, and control

- **AC-016:** The same canonical document/job/ruleset produces identical findings and scores across repeated runs; AI availability and explanation text cannot affect values.
- **AC-017:** ATS report shows per-category numerator/denominator, weight, finding rule IDs, affected locations, remediation, unavailable checks, ruleset version, and the statement that results are estimates.
- **AC-018:** Comparing any parent/child versions identifies section/text/claim/provenance changes; restore creates a new child and never rewrites the restored version.
- **AC-019:** Export fixtures produce parseable PDF and DOCX with section headings/lists, selectable text, no scripts/remote resources, and text content equivalent to the selected version within documented layout transformations.
- **AC-020:** A portability archive validates against a published schema, contains requested records and provenance, excludes secret plaintext, and can be dry-run imported with conflict counts before writes.
- **AC-021:** Individual deletion previews dependents. Source-binary-only deletion removes bytes but retains explicitly approved facts with a `source unavailable` marker. Workspace deletion blocks writes, removes active rows/files within 24 hours, and reports backup expiry at no more than 30 days.
- **AC-022:** Stored provider credentials are AES-256-GCM encrypted with per-record nonce and authenticated context, never returned after write, never logged, and become unusable when the master key is absent/wrong without exposing ciphertext details.
- **AC-023:** The packaged process binds only to `127.0.0.1`, rejects forwarded or non-loopback authorities, automatically provisions exactly one local workspace, exposes no sign-in/registration UI, opens without an account, and refuses startup when its bind host or public URL is non-loopback.

## Cross-cutting quality

- **AC-024:** File, URL, prompt-injection, output-injection, XSS, CSRF, IDOR, secret-leak, deletion, and denial-of-service regression suites pass documented malicious fixtures.
- **AC-025:** The portable package starts on a clean supported Windows host without Node, container runtime, SQLite, an account, or environment-file editing; health/readiness report no secrets; the launcher creates access-restricted settings without printing them; committed SQLite and file data survive stop/start and application replacement; and the ZIP contains no user data, generated credentials, or development caches.
- **AC-026:** On reference hardware, 95th-percentile authenticated page response, editor interaction, deterministic ATS analysis, and bounded job completion meet [performance budgets](../engineering/PERFORMANCE_BUDGETS.md).
- **AC-027:** Every PR requirement maps to at least one milestone and automated/manual test; documentation link and terminology checks pass with no stale implementation claims.
