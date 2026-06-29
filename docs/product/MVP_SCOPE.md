# MVP scope

## Included

The release-ready MVP satisfies PR-001 through PR-030 for one workspace per user. The same deployment may contain multiple isolated users, but registration is closed and there are no shared workspaces or collaboration roles. A personal deployment may enable trusted-local mode only on loopback.

The MVP includes structured career entries and immutable approved facts; resume/letter storage and versions; PDF/DOCX/Markdown/text/project-JSON import; human extraction approval; job text/file/secure-URL ingestion; requirement review; evidence matrix; provider-neutral structured AI tasks; grounded tailoring; atomic suggestions; manual editing; deterministic ATS estimates; PDF/DOCX/Markdown/text/JSON export; settings; portability; deletion; Docker Compose; and accessible responsive workflows.

## Provider and deployment boundary

Two provider adapters ship: a generic OpenAI-compatible adapter (including an OpenAI preset) and Ollama. Users supply credentials/models. No hosted inference is included. PostgreSQL is canonical in every environment; the lightweight developer path runs Node processes on the host with only PostgreSQL in Docker. Filesystem artifacts are the default; S3-compatible storage is optional.

## Release-ready definition

MVP is releasable only when acceptance criteria AC-001–AC-028 and milestones M01–M22 are complete; supported-claim and tenant-isolation negative tests pass; no open critical/high vulnerability lacks an explicit time-bounded exception; data export/delete recovery drills pass; WCAG 2.2 AA automated and manual critical-path checks pass; parser/SSRF/prompt-injection suites pass; Compose installs from a clean host; upgrade/rollback are documented; and limitations are visible in-product.

## Explicitly outside MVP

See [non-goals](NON_GOALS.md). In particular: job application submission, job-board scraping, browser extensions, OCR, shared editing, public sign-up, social login/OIDC, native mobile apps, recruiter features, proprietary ATS emulation, guaranteed hiring predictions, fine-tuning on user data, and marketplace templates.
