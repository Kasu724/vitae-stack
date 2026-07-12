# MVP scope

## Included

The release-ready MVP is a local-only, single-user tool with one automatically provisioned workspace and no login or account bootstrap. It includes structured career entries and immutable approved facts; resume/letter storage and versions; PDF/DOCX/Markdown/text/project-JSON import; extraction approval; job text/file/secure-URL ingestion; requirement review; evidence matching; provider-neutral structured AI tasks; grounded resume and cover-letter tailoring; atomic suggestion review; manual editing; deterministic ATS estimates; PDF/DOCX/Markdown/text/JSON export; settings; portability; deletion; and responsive workflows.

## Provider and deployment boundary

The Windows x64 release is a portable ZIP with bundled Node.js and embedded SQLite. It binds to loopback and stores structured data in a local SQLite file and binary artifacts in a sibling folder. A container runtime, separate database installation, cloud storage, and application account are not required or supported.

Two optional provider paths ship: generic OpenAI-compatible endpoints and Ollama. Users supply any remote credential or local model. No hosted inference is included, and all non-AI/manual and deterministic workflows remain available without a configured provider.

## Release-ready definition

MVP is releasable only when PR-001 through PR-029, AC-001 through AC-027, and milestones M01 through M22 are satisfied; provenance and unsupported-claim negative tests pass; no unaccepted fixable critical/high vulnerability remains; data export/deletion and stopped-data-folder backup/restore drills pass; parser/SSRF/prompt-injection suites pass; the portable package launches and preserves data across restart on a clean supported Windows environment; upgrade/rollback are documented; and limitations are visible in-product.

## Explicitly outside MVP

Remote hosting, multi-user accounts, shared workspaces, container runtime/container deployment, database administration, job application submission, job-board scraping, browser extensions, OCR, shared editing, public signup, social login/OIDC, native mobile apps, recruiter features, proprietary ATS emulation, guaranteed hiring predictions, fine-tuning on user data, and marketplace templates are excluded. See [non-goals](NON_GOALS.md).
