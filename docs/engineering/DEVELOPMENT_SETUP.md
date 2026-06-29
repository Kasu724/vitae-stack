# Development setup

M01–M03 implement the repository toolchain, accessible status shell, PostgreSQL schema/migrations, password and trusted-local authentication, database/auth tests, and production-shaped Compose baseline. Later milestone commands are labeled below and must not be reported as available.

## Supported baseline

Node.js 24 LTS, Corepack-managed pnpm 11.9.0, Docker Engine with Compose v2, Git, and a Chromium-compatible Playwright environment. Compose currently pins PostgreSQL 18.4 and Node 24.17.0. Windows PowerShell, macOS, and Linux are supported; the Node 24 container is the parity reference.

Implemented local bootstrap:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright install chromium
docker compose up --detach postgres
corepack pnpm db:migrate
corepack pnpm auth:bootstrap -- --email owner@example.test --name "Owner"
corepack pnpm dev
```

The bootstrap command reads a password through a non-echoing TTY. Automation may set `AUTH_BOOTSTRAP_PASSWORD_FILE` to a mounted secret for that process only. It refuses to run once any user exists. The app uses the `vitae_app` runtime role; migrations use the separate `vitae_owner` role. Copy `.env.example` to `.env` only when overriding development defaults, replace every active placeholder before deployment, keep host binding on `127.0.0.1`, and use synthetic documents. Artifact storage, providers, and workers are not active yet.

The implemented container baseline deliberately separates startup and migration:

```text
docker compose up --build --detach --wait
docker compose run --build --rm migrate
```

The app container does not receive migration credentials. It is non-root, read-only, and published only on loopback. PostgreSQL is also published only on loopback for development. `/api/health` is process liveness; `/api/ready` returns 200 only when the database and migration journal are current. Fixture seed commands and isolated parser/exporter profiles arrive in their owning milestones and will use only synthetic data.

The reference Compose app uses password mode. For a personal host-process deployment with no login UI, set `AUTH_MODE=trusted-local`, keep both `APP_BIND_HOST` and `BETTER_AUTH_URL` on loopback, and run the app directly. Non-loopback trusted-local startup is rejected. See [authentication and authorization](../architecture/AUTHENTICATION_AND_AUTHORIZATION.md) for reset and in-place conversion commands.

Run `pnpm db:generate` after a reviewed schema change, inspect the generated SQL, and run `pnpm db:check && pnpm test:integration`. Migrations are forward-only after review. Before a production migration, stop writes or enter the documented compatibility window, take and verify an encrypted `pg_dump`, run the one-shot migration, then verify `/api/ready`. Recovery restores the pre-migration dump into a fresh database and runs the previously compatible image; do not improvise a destructive down migration. `docker compose down --volumes` destroys local data and is only safe for disposable development volumes. See [repository structure](REPOSITORY_STRUCTURE.md) and [deployment](../architecture/DEPLOYMENT.md).
