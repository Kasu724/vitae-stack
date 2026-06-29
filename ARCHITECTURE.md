# Architecture

Vitae Stack is planned as a TypeScript modular monolith: one Next.js web/API application, one worker process built from the same repository, PostgreSQL, and private artifact storage. This is the smallest architecture that keeps interactive requests bounded while supporting parser, provider, and export jobs. It does not use microservices.

## Baseline

- Node.js 24 LTS, strict TypeScript, React 19.2, Next.js 16 App Router, Tailwind CSS 4, and Zod schemas.
- PostgreSQL 16+ through Drizzle ORM and reviewed SQL migrations; PostgreSQL in development and production.
- Better Auth email/password with closed registration. Explicit `trusted-local` mode is loopback-only; deployment fails closed on unsafe binding.
- Filesystem artifact store by default; an interface permits S3-compatible storage.
- OpenAI-compatible and Ollama AI adapters; task contracts own schemas, retries, redaction, and provenance validation.
- Database-backed jobs with a separately runnable worker; no Redis or external queue for MVP.
- Typed JSON document model rendered through sanitized, repository-owned PDF/DOCX/Markdown/text exporters.

Current official guidance was checked on 2026-06-28: [Next.js installation and Node requirements](https://nextjs.org/docs/app/getting-started/installation), [React versions](https://react.dev/versions), [Node release status](https://nodejs.org/en/about/previous-releases), [Drizzle PostgreSQL support](https://orm.drizzle.team/docs/get-started), and [Tailwind's Next.js guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs). Exact versions will be locked and audited in M01, not assumed from this planning repository.

## Invariants

Workspace ownership is present on every aggregate and checked at every server boundary. Approved evidence, document versions, job snapshots, task inputs, claims, and claim-evidence links are immutable. Models propose structured data; deterministic code authorizes, validates, scores, persists, and exports. Raw documents and provider secrets never reach the browser unless explicitly downloaded by their owner.

See [system context](docs/architecture/SYSTEM_CONTEXT.md), [components](docs/architecture/CONTAINER_AND_COMPONENT_DESIGN.md), [data model](docs/architecture/DATA_MODEL.md), [security](docs/security/SECURITY_ARCHITECTURE.md), and [ADRs](docs/adr/README.md).
