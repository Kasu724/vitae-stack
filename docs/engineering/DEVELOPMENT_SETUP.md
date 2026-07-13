# Development setup

## Prerequisites

- Node.js 24.18.0
- pnpm 11.9.0 through Corepack
- Git
- Chromium installed by Playwright for browser tests

Docker and an external database server are not used; SQLite is embedded in Node.js.

## First run

```text
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

Open <http://127.0.0.1:3000>. Defaults store development data under `var/`, which is ignored by Git. `.env.example` documents optional overrides. Set `DATABASE_PATH` and `ARTIFACT_STORAGE_ROOT` to isolated temporary locations for manual destructive testing.

`pnpm dev` runs the forward migration check before starting, so subsequent
development starts apply newly added migrations automatically.

## Common validation

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm db:check
pnpm build
```

Run the remaining gates listed in [quality gates](QUALITY_GATES.md) for affected features. Integration tests create temporary SQLite databases and require no external service.

## Portable build

On Windows, run `scripts/personal/package.ps1`. Extract the resulting ZIP to a temporary directory, set `VITAE_DATA_DIR` to another temporary directory, start with `scripts/personal/vitae.ps1 Start -NoBrowser`, check `/api/ready`, stop, start again, and verify the same data remains. Never package `var/`, `.vitae-stack/`, temporary databases, settings keys, or user documents.
