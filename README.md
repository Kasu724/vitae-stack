# Vitae Stack

Vitae Stack is a private, evidence-grounded resume and cover-letter tailoring tool. It runs on one computer, requires no account, and saves its data locally. Generated factual claims must cite user-approved evidence; unsupported claims block final export. ATS results are explainable estimates, not guarantees.

## Download-and-run model

The Windows release is a portable ZIP. Extract it and double-click `Start Vitae Stack.cmd`. The launcher opens the tool at <http://127.0.0.1:3000> and creates:

- `%LOCALAPPDATA%\Vitae Stack\vitae.sqlite` for structured records and history;
- `%LOCALAPPDATA%\Vitae Stack\files\` for uploads and generated documents; and
- `%LOCALAPPDATA%\Vitae Stack\settings.env` for the locally generated credential-encryption key.

No Docker, PostgreSQL server, cloud database, application account, telemetry service, or hosted AI provider is required. `Stop Vitae Stack.cmd` stops the local process without deleting data. See [personal use](PERSONAL_README.md).

## Development

Node.js 24.18.0 and pnpm 11.9.0 are the supported toolchain.

```text
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

Development defaults to `./var/vitae.sqlite` and `./var/files`. Copy `.env.example` only when overriding defaults. Build the portable Windows package with `scripts/personal/package.ps1` or `Build Personal Bundle.cmd`.

## Architecture and scope

The application is a TypeScript/Next.js modular monolith. SQLite provides transactions, constraints, indexes, and durable document/version/provenance relationships while remaining one ordinary local file. Uploaded and generated binary files stay in a separate local folder. AI providers are optional and sit behind a provider-neutral interface; Ollama and OpenAI-compatible endpoints are supported without making either mandatory.

The release is deliberately local-only and single-user. Remote hosting, shared accounts, team workspaces, job-board scraping, and automated job submission are outside the MVP. See [MVP scope](docs/product/MVP_SCOPE.md), [architecture](ARCHITECTURE.md), and [ADR-0021](docs/adr/0021-local-sqlite-no-account-runtime.md).

## Status and licensing

Implementation exists, but release readiness is determined only by the gates recorded in [release readiness](docs/releases/RELEASE_READINESS.md); this README does not claim an unpublished release.

Vitae Stack is licensed under [AGPL-3.0-only](LICENSE). Security reports should follow [SECURITY.md](SECURITY.md). Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md).
