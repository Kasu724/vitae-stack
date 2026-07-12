# Coding standards

- Strict TypeScript with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, no implicit `any`, and exhaustive discriminated unions. Avoid non-null assertions and unsafe casts; justify boundary casts next to validation.
- Zod-validate HTTP, environment, database JSON, parser/provider output, imports, and job payloads. Domain types express IDs/units/states; never pass raw strings for secrets or ownership scope casually.
- Functional pure rules for ATS, provenance, lifecycle, and authorization decisions; inject clock/ID/provider/storage for tests.
- Route handlers are thin. Repositories require workspace scope. Transactions preserve aggregate invariants; idempotency is explicit.
- Errors are typed and safe. Never catch-and-ignore, expose stack/provider body, or log content. Use correlation IDs and allowlisted fields.
- React uses Server Components by default and client components only for interaction. Components support narrow-screen reflow, loading, and error states.
- CSS uses design tokens and Tailwind utilities without unreadable one-off values. No color-only status or motion-required behavior.
- SQL migrations are generated then reviewed, forward-compatible across one release, reversible by recovery plan, and never edited after release.
- Comments explain invariants/tradeoffs, not syntax. Public contracts and security-sensitive functions include concise documentation.
- Dependencies need a documented purpose, license, maintenance/security review, and must not replace small auditable code without benefit.

Formatting and lint rules are automated in M01. Generated output is checked in only when review/reproducibility requires it and is labeled with generator/version.
