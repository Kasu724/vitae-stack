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

Do not report a command as passing unless it was run in the current environment.
