# Agent and contributor instructions

## Mission and invariants

Build a privacy-first, self-hostable career-document platform. Never fabricate career facts; every generated factual claim must cite approved immutable evidence. Unsupported claims block final export. ATS output is an explainable estimate, not a guarantee. Users control changes, portability, and deletion.

## Authority and map

`docs/` is the source of truth. Start at [docs/README.md](docs/README.md). Product behavior is authoritative in `docs/product/PRODUCT_REQUIREMENTS.md` and `ACCEPTANCE_CRITERIA.md`; architecture in `ARCHITECTURE.md` and `docs/architecture/`; security in `docs/security/`; decisions in `docs/adr/`; delivery sequencing in `docs/exec-plans/active/MVP_IMPLEMENTATION.md`. If a nested `AGENTS.md` is added, inspect it before changing that subtree; its narrower rules take precedence.

## Workflow

1. Read the relevant requirements, ADRs, threat model, and milestone.
2. Keep changes scoped to one independently verifiable outcome.
3. Update tests, traceability, architecture, and operations docs with behavior changes.
4. Run the applicable gates: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:contract`, `pnpm test:evals --smoke`, `pnpm test:parsers`, `pnpm test:security`, `pnpm test:ssrf`, `pnpm test:e2e`, `pnpm test:a11y`, `pnpm test:smoke`, `pnpm build`, `pnpm db:check`, `pnpm docs:check`, and `pnpm security:check`. Never report a command as run unless it was executed in the current environment.

## Engineering rules

Use strict TypeScript; validate every trust boundary; keep domain logic independent of Next.js and providers; authorize every workspace-scoped read/write; make migrations forward-safe; use accessible semantic UI; and test deterministic rules with fixtures. Prefer a modular monolith over services. Do not log document content, prompts, model output, credentials, cookies, or tokens.

Secrets belong in environment variables or encrypted credential records and never in Git, browser storage, telemetry, fixtures, or errors. Treat files, URLs, templates, prompts, and model output as hostile. Preserve provenance across edits and versions. Deletion and export behavior are product features, not maintenance tasks.

## Definition of done

A change is done only when its acceptance criteria pass, authorization and abuse cases are covered, accessibility is keyboard/screen-reader usable, errors are safe and actionable, required tests and docs are updated, and relevant gates pass. Do not claim a feature, deployment, migration, test, or security control exists or passes unless verified in the current repository/environment.
