# API design

The browser uses same-origin Next.js Route Handlers under `/api/v1`. Server Components may call application services directly but must use the same authorization and validation policies. There is no public third-party API commitment in MVP.

## Conventions

- JSON uses UTF-8, camelCase, opaque IDs, RFC 3339 UTC timestamps, and versioned Zod schemas.
- Mutations require session, CSRF protection where cookies apply, workspace resolution, `Content-Type`, payload limits, and an idempotency key for long/chargeable/destructive operations.
- Mutable drafts use `If-Match`/revision; immutable creation returns `201`; async jobs return `202` with status URL.
- Errors use `application/problem+json`: stable `type`, safe `title/detail`, HTTP `status`, `code`, `correlationId`, and field errors. Authorization intentionally collapses not-found/forbidden to `404` where ownership could leak.
- Pagination is cursor-based with bounded page size. Filters are allowlisted. Downloads use authorized streams, `nosniff`, safe `Content-Disposition`, and no public storage URL.

## Resource surface

`/career-entries`, `/evidence-facts`, `/sources`, `/documents`, `/document-versions`, `/jobs`, `/job-requirements`, `/matches`, `/tailoring-runs`, `/suggestions`, `/ats-reports`, `/exports`, `/providers`, `/portability-exports`, `/deletions`, and `/operations` expose task-specific subresources rather than generic CRUD for lifecycle transitions (`approve`, `supersede`, `withdraw`, `accept`, `restore`).

Structured AI tasks and storage/provider adapters are internal interfaces, not client-selectable arbitrary methods. API contract tests verify schema, status, idempotency, authorization, and redaction. Breaking changes require `/v2` or a documented migration window; archive schemas version independently.
