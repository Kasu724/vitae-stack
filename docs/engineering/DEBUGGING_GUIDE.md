# Debugging guide

Use synthetic data only. Never paste real resumes, provider credentials, prompts, model output, or local data-folder contents into issues or logs.

- Startup: run the launcher with `Status` and `Logs`; check that port 3000 is free, bind/base URL are loopback, and the data folder is writable.
- Readiness: `/api/health` proves the process responds; `/api/ready` also verifies the SQLite schema journal and core tables.
- Schema: `pnpm db:check` executes migrations in memory and validates integrity, foreign keys, and lifecycle triggers. `pnpm test:integration` uses isolated temporary SQLite files.
- Parsing: reproduce with a minimal synthetic fixture and run `pnpm test:parsers`; inspect only safe error codes and parser timing.
- URL fetching: run `pnpm test:ssrf`; do not weaken address/redirect validation to make one site work—paste or upload is the fallback.
- Providers: use the fake adapter/contract tests first. Confirm endpoint allowlisting and key availability without printing the key.
- Exports: run `pnpm test:exports` and preserve only synthetic artifact/hash/version metadata.
- Package: extract the ZIP to a fresh folder and set `VITAE_DATA_DIR` to an isolated temporary folder. Use the packaged launcher and bundled runtime, not globally installed Node.

For database inspection, stop the application and work on a copy. Never edit a live SQLite file or individual WAL/SHM files. Restore the entire coordinated data-folder copy if an experiment fails.
