# Repository structure

M01–M05 established the application, database, authentication, Career Information Bank, and versioned document-library foundation. M06–M10 currently add private source ingestion, isolated parsers/fetcher, extraction review, immutable job snapshots, and reviewed requirement revisions. M12 adds provider configuration, encrypted credentials, endpoint policy, adapters, task contracts, and synthetic evaluations. Their environment-dependent completion gates remain pending. The current implementation directories are:

```text
/
├─ src/app/                    # Accessible shell, auth, health, dashboard, and career routes
├─ src/infrastructure/config/  # Server-only runtime configuration boundary
├─ src/infrastructure/database/# Connections, readiness, migrations, job leasing
├─ src/modules/auth/            # Auth factory, principal, workspace policy, accessible UI
├─ src/modules/career/          # Career validation, lifecycle repository, actions, and forms
├─ src/modules/documents/       # Canonical schema, drafts, versions, claims, and editor
├─ src/modules/ingestion/       # Upload validation, parser boundary, source lifecycle
├─ src/modules/extraction/      # Pending proposal review and evidence approval
├─ src/modules/jobs/            # Job normalization, immutable revisions, actions
├─ src/modules/job-fetch/       # SSRF policy, fetch protocol, import lifecycle
├─ db/schema/                  # Typed PostgreSQL schema
├─ db/migrations/              # Reviewed forward SQL and Drizzle snapshots
├─ docker/postgres/init/       # Development least-privilege role bootstrap
├─ tests/{unit,database,integration,parsers,security,e2e,a11y,smoke}/
├─ docs/                       # Authoritative project documentation
├─ scripts/                    # Documentation and secret-pattern checks
├─ .github/                    # Community metadata and reference CI
├─ Dockerfile
└─ compose.yaml
```

The intended MVP structure grows by milestone as follows:

```text
/
├─ src/app/                 # Next.js routes and presentation adapters
├─ src/components/          # Accessible repository-owned UI
├─ src/modules/             # Domain/application modules by bounded context
├─ src/infrastructure/      # DB, auth, storage, providers, jobs, telemetry
├─ src/worker/              # Job registrations and worker entry
├─ db/schema/               # Drizzle schema
├─ db/migrations/           # Reviewed immutable SQL migrations
├─ tests/{unit,integration,contract,e2e,a11y,security,evals}/
├─ fixtures/                # Synthetic versioned fixtures
├─ templates/               # Non-executable export templates
├─ docs/                    # Authoritative project documentation
├─ scripts/                 # Bounded developer/release tooling
└─ .github/                 # Community and CI metadata
```

Directories not present are not implemented. Each milestone creates only the modules, fixtures, migrations, and tests needed by its accepted scope.

Dependencies point inward: UI/routes and infrastructure depend on application/domain contracts; domain logic does not import Next.js, Drizzle, storage SDKs, provider SDKs, or browser APIs. Module public interfaces are explicit; cross-module writes go through application services. Test helpers cannot become production dependencies.

Add nested `AGENTS.md` only where a subtree needs narrower security/generated-file/test rules. Keep them concise and link authoritative docs rather than duplicating policy.
