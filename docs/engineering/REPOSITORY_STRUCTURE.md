# Repository structure

M01–M05 established the application, database, authentication, Career Information Bank, and versioned document-library foundation. M06–M11 add private source ingestion, extraction review, job snapshots, reviewed requirements, and evidence matching. M12 adds provider-neutral AI adapters. M13–M15 add evidence-grounded tailoring and atomic suggestion review. M16 adds deterministic ATS reports. M17 adds tagged PDF, structured DOCX, Markdown, text, and JSON renderers, strict claim gating, parse-back validation, private expiring artifacts, authorized downloads, and an accessible export workflow. M18 adds versioned portability, privacy controls, and replay-safe deletion. M19–M20 add security, CSP/rate limits, accessibility, responsive alternatives, and validation records. M21–M22 recovery and release evidence remain pending. The current implementation directories are:

```text
/
├─ src/app/                    # Accessible shell, auth, health, dashboard, and career routes
├─ src/infrastructure/         # Config, database, artifacts, and security boundaries
├─ src/modules/auth/            # Auth factory, principal, workspace policy, accessible UI
├─ src/modules/career/          # Career validation, lifecycle repository, actions, and forms
├─ src/modules/documents/       # Canonical schema, drafts, versions, claims, and editor
├─ src/modules/ingestion/       # Upload validation, parser boundary, source lifecycle
├─ src/modules/extraction/      # Pending proposal review and evidence approval
├─ src/modules/jobs/            # Job normalization, immutable revisions, actions
├─ src/modules/job-fetch/       # SSRF policy, fetch protocol, import lifecycle
├─ src/modules/matching/        # Deterministic requirement-to-evidence matching
├─ src/modules/providers/       # Provider-neutral adapters, credentials, and task runner
├─ src/modules/requirements/    # Requirement extraction and immutable review revisions
├─ src/modules/tailoring/       # Grounded resume run, validators, persistence, orchestration
├─ src/modules/ats/             # Pure deterministic rules and immutable report persistence
├─ src/modules/exports/         # Claim gate, fixed renderers, parse-back, private artifacts
├─ src/modules/portability/     # Versioned archive export, dry-run, and import
├─ src/modules/privacy/         # Tombstones and idempotent workspace deletion
├─ db/schema/                  # Typed PostgreSQL schema
├─ db/migrations/              # Reviewed forward SQL and Drizzle snapshots
├─ docker/postgres/init/       # Environment-driven least-privilege role bootstrap
├─ tests/{unit,database,integration,contract,evals,parsers,security,ats,exports,portability,deletion,e2e,a11y,smoke}/
├─ docs/                       # Authoritative project documentation
├─ scripts/                    # Worker, seed, validation, backup, and release tooling
├─ .github/                    # Community metadata and commit-pinned CI/release workflows
├─ Dockerfile
├─ compose.yaml              # Loopback development/source-build stack
└─ compose.production.yaml   # Secret-required digest-pinned release overlay
```

Directories not present are not implemented. No separate `src/components`, `src/worker`, runtime template language, or fixtures package is implied; components remain owned by their modules, worker entry points are bounded scripts, and export templates are fixed code-owned renderers.

Dependencies point inward: UI/routes and infrastructure depend on application/domain contracts; domain logic does not import Next.js, Drizzle, storage SDKs, provider SDKs, or browser APIs. Module public interfaces are explicit; cross-module writes go through application services. Test helpers cannot become production dependencies.

Add nested `AGENTS.md` only where a subtree needs narrower security/generated-file/test rules. Keep them concise and link authoritative docs rather than duplicating policy.
