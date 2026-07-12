# ADR-0003: Use strict TypeScript with Next.js App Router

- **Status:** Accepted; packaging amended by [ADR-0021](0021-local-sqlite-no-account-runtime.md)
- **Date:** 2026-06-28

## Context

The product needs a responsive editor, same-origin server APIs, SSR, and shared validation/types. Official Next.js guidance currently supports App Router, TypeScript, Tailwind, self-hosting, and Node 20.9+; Node 24 is LTS as of the decision date.

## Decision

Use Node.js 24 LTS, strict TypeScript, React 19.2, Next.js 16 App Router, Tailwind CSS 4, and Zod. Pin exact compatible security-patched versions in M01. Default to Server Components; use Client Components only for interactions. ADR-0021 replaces the original container packaging with a bundled standalone Node runtime.

## Alternatives considered

Separate SPA/API duplicates contracts and deployment. Remix/SvelteKit are credible but diverge from the preferred ecosystem. JavaScript weakens boundary/domain guarantees. Serverless-first designs risk provider lock-in and parser/worker constraints.

## Consequences

One language and framework simplify contributions and schemas. Next.js/React security changes require rapid patching; framework conventions must not leak into domain modules. App Router complexity needs focused tests.

## Security and privacy implications

Server-only modules guard secrets and raw files; client bundles are audited. React/Next advisories, especially server-function parsing, are release blockers. No third-party telemetry by default.

## Revisit conditions

Framework loses maintained self-hosting, LTS compatibility, tooling viability, or security support; major-version upgrade receives compatibility ADR/addendum.
