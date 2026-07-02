# Test strategy

## Layers

- **Unit:** domain lifecycles, provenance, ATS rules/math, URL/IP classification, schema transforms, template escaping.
- **Integration/database:** repositories, transactions, migrations, job leasing/idempotency, deletion cascades, storage, auth sessions, workspace isolation.
- **Contract:** HTTP problem details/schemas; parser, provider adapter, artifact, and AI task interfaces; fake-provider refusal/timeout/malformed output.
- **Parser:** representative and malicious PDF/DOCX/Markdown/text/JSON corpus, resource/cleanup checks, locator goldens.
- **AI schema/evals:** structured validation, citation/semantic gates, provider portability, injection datasets, thresholds in evaluation plan.
- **ATS:** golden/property/metamorphic rules, ruleset versioning, export parse-back.
- **End-to-end:** onboarding → approval → job → evidence → tailoring → review → ATS → export; portability/delete; failure/retry/version conflict.
- **Accessibility:** semantic/component tests, axe, keyboard flows, reflow, focus, and manual assistive-technology matrix.
- **Export visual/snapshot:** normalized text/structure, PDF page images, DOCX parse-back/accessibility, malicious content.
- **Security regression:** IDOR, CSRF, XSS, SSRF/rebinding/redirect, upload bombs, prompt/output injection, secret redaction, quotas, improper deletion.

Tests use synthetic data and deterministic clocks/IDs. Network is denied by default; providers/websites/storage are local fakes except explicit opt-in compatibility tests. Never place real resumes, keys, or production exports in fixtures/snapshots.

Pull requests run fast unit/contract/security subsets; main runs PostgreSQL integration, E2E/accessibility, parser/export, and eval smoke. Scheduled/release runs full malicious corpus, multi-model opt-in evals, dependency/container scans, load/recovery, and manual accessibility/security sign-offs.

Flaky tests are defects: quarantine requires owner, issue, expiry, preserved coverage, and cannot mask security/provenance/deletion gates.

M17's automated `test:exports` suite renders all five formats, parses PDF/DOCX back through the pinned ingestion parsers, checks ≥98% ordered source-token retention, validates tagged PDF metadata/selectable text, inspects DOCX heading/list XML and relationships/macros, exercises Unicode and Markdown/bidirectional injection, and proves binary blocking versus labeled draft output. PostgreSQL integration covers immutable private metadata, idempotent reuse, workspace isolation, integrity checks, and claim-state changes. Release review additionally renders a multipage synthetic PDF to images and checks clipping, overlap, wrapping, margins, and section/list continuation; assistive-technology validation remains manual evidence.

M18's `test:portability` and `test:deletion` suites validate the archive allowlist/version, blob integrity, secret-field detection, recent-auth boundary, and content-free tombstone persistence. PostgreSQL integration exports career/document/provenance/source/provider data, proves credential absence, freezes concurrent writes, deletes rows/files/account, checks the backup-expiry bound, dry-runs a clean target, and imports with regenerated storage keys and owner references. M21 adds fault-injected storage outage, orphan cleanup, and coordinated backup-restore replay drills.
