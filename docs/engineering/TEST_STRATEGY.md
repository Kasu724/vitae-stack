# Test strategy

## Layers

- **Unit:** domain lifecycles, provenance, ATS AI schema/service boundaries, URL/IP classification, schema transforms, template escaping.
- **Integration/database:** repositories, transactions, SQLite migrations, job leasing/idempotency, deletion cascades, storage, and workspace isolation.
- **Contract:** HTTP problem details/schemas; parser, provider adapter, artifact, and AI task interfaces; fake-provider refusal/timeout/malformed output.
- **Parser:** representative and malicious PDF/DOCX/Markdown/text/JSON corpus, resource/cleanup checks, locator goldens.
- **AI schema/evals:** structured validation, citation/semantic gates, provider portability, injection datasets, thresholds in evaluation plan.
- **ATS:** AI-11 job/no-job schema, prompt separation, provider assignment, immutable model/input/output provenance, workspace isolation, and advisory-only behavior.
- **End-to-end:** first-use local workspace → approval → job → evidence → tailoring → review → ATS → export; portability/delete; failure/retry/version conflict.
- **Export visual/snapshot:** normalized text/structure, PDF page images, DOCX parse-back, malicious content.
- **Security regression:** workspace-object isolation, origin/authority checks, XSS, SSRF/rebinding/redirect, upload bombs, prompt/output injection, secret redaction, quotas, and improper deletion.

Tests use synthetic data and deterministic clocks/IDs. Network is denied by default; providers/websites/storage are local fakes except explicit opt-in compatibility tests. Never place real resumes, keys, or production exports in fixtures/snapshots.

CI runs the documented quality suites, isolated Chromium E2E, and an extracted Windows-package smoke/personal check. Release-tag CI repeats the full quality/browser/package gates. Production load/recovery drills and opt-in live-provider compatibility tests remain explicit local/manual release evidence; they are not claimed as scheduled automation.

Flaky tests are defects: quarantine requires owner, issue, expiry, preserved coverage, and cannot mask security/provenance/deletion gates.

M17's automated `test:exports` suite renders all five formats, parses PDF/DOCX back through the pinned ingestion parsers, checks ≥98% ordered source-token retention plus exact representative PDF Unicode retention, validates PDF metadata/selectable text, inspects DOCX heading/list XML and relationships/macros, exercises Markdown/bidirectional injection, and proves binary blocking versus labeled draft output. SQLite integration covers immutable private metadata, idempotent reuse, workspace isolation, integrity checks, and claim-state changes. Release review additionally renders a multipage synthetic PDF to images and checks clipping, overlap, wrapping, margins, and section/list continuation.

M18's `test:portability` and `test:deletion` suites validate the archive allowlist/version, blob integrity, secret-field detection, explicit destructive confirmation, and content-free tombstone persistence. SQLite integration exports career/document/provenance/source/provider data, proves credential absence, freezes concurrent writes, deletes rows/files/local principal, dry-runs a clean target, and imports with regenerated storage keys and owner references. M21 adds fault-injected storage outage, orphan cleanup, and coordinated folder-backup restore drills.
