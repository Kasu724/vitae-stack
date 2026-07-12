# Quality Gates

Changes should run the narrowest checks that cover the affected behavior. Release candidates require the full gate set.

## Core Checks

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:contract
pnpm test:evals --smoke
pnpm db:check
pnpm build
```

## Domain Checks

```text
pnpm test:parsers
pnpm test:ats
pnpm test:exports
pnpm test:portability
pnpm test:deletion
pnpm test:security
pnpm test:ssrf
pnpm test:performance
pnpm test:load
pnpm test:e2e
pnpm test:smoke
pnpm test:personal
pnpm docs:check
pnpm notices:check
pnpm security:check
```

CI runs every gate above except `test:load`, `test:smoke`, and `test:personal` in
the generic Linux quality job. Browser E2E runs in its isolated browser job;
smoke and personal-package checks run against the extracted Windows bundle.
`test:load` is a local release-candidate gate and must target a production build,
not the development server where on-demand compilation invalidates the latency
budget.

Do not report a command as passing unless it was run in the current environment.
