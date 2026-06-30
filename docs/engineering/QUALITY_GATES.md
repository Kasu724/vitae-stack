# Quality gates

The commands below are implemented; capability-specific coverage expands with its owning milestone. A gate may be reported as passing only when it was run in the current environment.

| Gate           | Command                   | Current availability                                                      | PR expectation                                                           |
| -------------- | ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Formatting     | `pnpm format:check`       | Implemented                                                               | all tracked source/docs/config                                           |
| Lint           | `pnpm lint`               | Implemented                                                               | zero errors and zero unbudgeted warnings                                 |
| Type check     | `pnpm typecheck`          | Implemented                                                               | strict, zero errors                                                      |
| Unit           | `pnpm test`               | Implemented                                                               | changed behavior and invariant coverage                                  |
| Integration/DB | `pnpm test:integration`   | Implemented for migration, ownership, role, transaction, and lease rules  | PostgreSQL, migrations, isolation, jobs                                  |
| Contract       | `pnpm test:contract`      | Implemented; M12 adds provider adapter contracts                          | API/provider/parser/storage schemas                                      |
| AI evaluations | `pnpm test:evals --smoke` | Implemented synthetic provider/task smoke harness                         | task schemas, hard validators, injection and model thresholds            |
| E2E            | `pnpm test:e2e`           | Implemented for the M01 shell                                             | changed critical paths                                                   |
| Accessibility  | `pnpm test:a11y`          | Implemented for the M01 shell                                             | zero serious/critical automated issues plus required manual evidence     |
| Smoke          | `pnpm test:smoke`         | Implemented; requires a running deployment or `PLAYWRIGHT_BASE_URL`       | deployment health and release-critical smoke paths                       |
| Build          | `pnpm build`              | Implemented                                                               | reproducible production build                                            |
| Migrations     | `pnpm db:check`           | Implemented migration-artifact and Drizzle journal checks                 | drift, forward migration, compatibility/recovery                         |
| Security       | `pnpm security:check`     | Implemented secret-pattern and production dependency audit baseline       | SCA, secrets, SAST/config and regression subset                          |
| Documentation  | `pnpm docs:check`         | Implemented link/current-state/placeholder baseline; expands continuously | links, requirement/milestone/test IDs, terminology, current-state claims |

Required checks are branch-protected once implemented. Critical security, cross-tenant, unsupported-claim, deletion, export-injection, and migration failures cannot be waived. Other temporary exceptions require maintainer approval, issue, rationale, compensating evidence, and expiry.

Release adds clean Compose install, upgrade/rollback/restore drill, SBOM/provenance, container scan, full E2E/evals/malicious fixtures, performance budgets, WCAG manual matrix, license review, changelog, and documentation consistency. Coverage percentages are diagnostic; risk-based behavior coverage is the gate.
