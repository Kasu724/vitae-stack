# Repository structure

```text
/
├─ src/app/                    # Next.js routes, pages, and local HTTP boundary
├─ src/infrastructure/         # Config, SQLite, files, and security boundaries
├─ src/modules/auth/           # Trusted-local principal and workspace policy
├─ src/modules/career/         # Career entries and approved evidence lifecycle
├─ src/modules/documents/      # Drafts, immutable versions, claims, and editor
├─ src/modules/ingestion/      # Upload validation and bounded parsing
├─ src/modules/extraction/     # Proposal review and evidence approval
├─ src/modules/jobs/           # Job snapshots and revisions
├─ src/modules/job-fetch/      # SSRF policy and bounded URL retrieval
├─ src/modules/matching/       # Requirement-to-evidence matching
├─ src/modules/providers/      # Provider-neutral adapters and credentials
├─ src/modules/requirements/   # Requirement extraction and review
├─ src/modules/tailoring/      # Grounded resume and cover-letter runs
├─ src/modules/ats/            # Deterministic rules and reports
├─ src/modules/exports/        # Claim gate and document renderers
├─ src/modules/portability/    # Logical archive export/import
├─ src/modules/privacy/        # Deletion and tombstones
├─ db/migrations/              # Reviewed forward SQLite migrations
├─ tests/                      # Unit, integration, security, browser, and fixture suites
├─ docs/                       # Authoritative product and engineering documentation
├─ scripts/personal/           # Local launcher and Windows package builder
├─ scripts/                    # Seeds, checks, migrations, and bounded helpers
└─ .github/                    # Community metadata and pinned CI/release workflows
```

There is no container definition, database-server configuration, account service, or microservice tree. The packaged application stores user data outside its extracted binaries.

Dependencies point inward: UI/routes and infrastructure depend on application/domain contracts; domain logic does not import Next.js, storage SDKs, provider SDKs, or browser APIs. Cross-module writes go through application services. Test helpers cannot become production dependencies.

Add nested `AGENTS.md` only when a subtree needs narrower rules. Keep it concise and link authoritative docs instead of duplicating policy.
