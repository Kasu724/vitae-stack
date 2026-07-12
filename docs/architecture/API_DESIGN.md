# API design

The browser uses same-origin Next.js Route Handlers under `/api`. Server Components may call application services directly but must use the same authorization and validation policies. There is no public third-party API commitment in MVP; a future public contract would begin at `/api/v1` rather than treating current browser endpoints as stable.

## Conventions

- JSON uses UTF-8, camelCase, opaque IDs, RFC 3339 UTC timestamps, and versioned Zod schemas.
- Mutations require an exact same-origin request, the server-derived local principal/workspace, boundary-specific `Content-Type` and payload limits, and an idempotency key for long or destructive operations.
- Mutable drafts use `If-Match`/revision; immutable creation returns `201`; async jobs return `202` with status URL.
- Errors use `application/problem+json`: stable `type`, safe `title/detail`, HTTP `status`, `code`, `correlationId`, and field errors. Authorization intentionally collapses not-found/forbidden to `404` where ownership could leak.
- Collection pagination is bounded and stable: browser pages may use a capped one-based page/offset contract over a deterministic sort, while API-style feeds may use opaque cursors. The Career Bank currently returns 25 entries ordered by `updated_at DESC, id` and caps requested pages at 10,000. Filters are allowlisted. Downloads use authorized streams, `nosniff`, safe `Content-Disposition`, and no public storage URL.

## Resource surface

`/career-entries`, `/evidence-facts`, `/sources`, `/documents`, `/document-versions`, `/jobs`, `/job-requirements`, `/matches`, `/tailoring-runs`, `/suggestions`, `/ats-reports`, `/exports`, `/providers`, `/portability-exports`, `/deletions`, and `/operations` expose task-specific subresources rather than generic CRUD for lifecycle transitions (`approve`, `supersede`, `withdraw`, `accept`, `restore`).

Structured AI tasks and storage/provider adapters are internal interfaces, not client-selectable arbitrary methods. API contract tests verify schema, status, idempotency, authorization, and redaction. Breaking changes require `/v2` or a documented migration window; archive schemas version independently.

Implemented M17 endpoints are `POST /api/exports` and `GET /api/exports/{artifactId}`. Creation accepts only opaque document/version IDs and an allowlisted format, enforces exact-origin/workspace/rate/claim gates, returns `201` for an immutable artifact, and returns a machine-readable `409 UNSUPPORTED_CLAIMS` with a remediation URL for blocked PDF/DOCX. Download reauthorizes the workspace, re-evaluates current grounding/evidence state, checks the manifest, expiry, byte hash/size, and parse-back, then streams an attachment without exposing a storage path.

Implemented M18 endpoints are `POST /api/portability/export`, `POST /api/portability/import`, and `POST /api/privacy/workspace-deletion`. They require exact origin and the server-derived workspace; there is no login or recent-authentication concept. Export returns a private no-store JSON attachment. Import accepts only a bounded JSON file plus `dry-run` or `apply`; invalid semantics fail before writes, while a populated target or UUID collision returns `409 IMPORT_CONFLICT`. Deletion requires the literal `DELETE MY WORKSPACE`, freezes all ordinary mutations, records a durable tombstone, attempts erasure immediately, and returns a content-free receipt/status. Startup and recurring maintenance retry failed/stale operations.
