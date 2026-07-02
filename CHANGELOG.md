# Changelog

All notable changes are recorded here. The project follows semantic versioning; no release has been published from this worktree.

## [Unreleased]

### Added

- Release-ready MVP implementation spanning structured career evidence, secure import, job analysis, grounded resume and cover-letter tailoring, explicit suggestion review, deterministic ATS estimates, fixed-template exports, portability, and replay-safe deletion.
- Password and loopback-only trusted-local authentication modes for isolated self-hosted workspaces.
- Provider-neutral OpenAI-compatible and Ollama adapters with schema validation, bounded repair, endpoint policy, encrypted credentials, and deterministic test providers.
- PostgreSQL-backed immutable versions, provenance, work queues, audit events, ATS reports, exports, portability archives, and deletion receipts.
- Non-root Compose services for the web app, parser, URL fetcher, deletion worker, migration tools, and PostgreSQL.
- Automated unit, integration, contract, parser, security, ATS, export, portability, deletion, evaluation, browser, accessibility, smoke, and load gates.

### Security

- Strict upload, archive, SSRF/DNS/redirect, prompt-injection, model-output, CSP, origin, rate-limit, secret/logging, workspace-authorization, and deletion controls.

### Known release blockers

- The external manual accessibility matrix still requires NVDA/Firefox+Chrome, VoiceOver/Safari, and PDF/DOCX assistive-technology evidence on the named platforms.
- Maintainers must run the protected remote CodeQL/image scan, SBOM/provenance/attestation, tag, and draft-release workflows. No tag or release artifact has been published.
