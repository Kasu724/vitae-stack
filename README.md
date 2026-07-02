# Vitae Stack

Vitae Stack is a free, open-source, privacy-first platform under active development for producing evidence-grounded resumes and cover letters. The MVP implementation maps job requirements to user-approved career facts, explains proposed changes, estimates ATS compatibility, and keeps users in control of every factual claim.

> **Current state (2026-07-01): M01–M20 are implemented and locally validated; M21 is complete except for external manual assistive-technology evidence, and M22 publication remains maintainer-controlled.** Static, database, browser, security, export, portability, deletion, clean Compose, cold-worker, performance, and encrypted backup/restore gates pass locally. No tag, image, attestation, or GitHub release has been published; NVDA/VoiceOver and document-assistive-technology matrix rows must be completed on the named platforms before publication.

## Run locally

Use Node.js 24 and Corepack-managed pnpm 11.9.0:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Or validate the production-shaped deployment:

```text
docker compose up --build --detach postgres
docker compose run --build --rm migrate
docker compose up --build --detach --wait app parser job-fetcher deletion-worker
```

For password mode, create the first account with `pnpm auth:bootstrap -- --email <address> --name <name>`; the command reads the password without echo or from an access-restricted mounted file. Open `http://127.0.0.1:3000`. See [development setup](docs/engineering/DEVELOPMENT_SETUP.md) for exact procedures and current limitations.

The commands above use development-only Compose credentials on loopback. A published release uses versioned images plus `compose.production.yaml` and an access-restricted environment file based on `.env.production.example`; see [deployment](docs/architecture/DEPLOYMENT.md). No release artifact is claimed until the signed tag, checksums, SBOMs, and attestations are published.

## Non-negotiable behavior

- Generated factual claims must cite immutable, user-approved evidence facts.
- Missing or conflicting evidence must never be silently filled in.
- Final export is blocked while factual claims are unsupported or unresolved.
- ATS results are deterministic, explainable estimates—not reproductions or guarantees from proprietary applicant-tracking systems.
- The default deployment is self-hostable and does not require paid infrastructure or a proprietary AI provider.
- Imported career data is never used by this project for model training.

## MVP architecture

The MVP is a responsive Next.js modular monolith with PostgreSQL, a small database-backed worker, local private-file storage, provider-neutral AI adapters, and deterministic ATS rules. It supports personal single-user deployments and closed-registration multi-user deployments without changing the data model. See [MVP scope](docs/product/MVP_SCOPE.md), [architecture](ARCHITECTURE.md), and [implementation plan](docs/exec-plans/active/MVP_IMPLEMENTATION.md).

## Documentation map

- [Documentation index](docs/README.md)
- [Product requirements](docs/product/PRODUCT_REQUIREMENTS.md)
- [Acceptance criteria](docs/product/ACCEPTANCE_CRITERIA.md)
- [Security architecture](docs/security/SECURITY_ARCHITECTURE.md)
- [AI principles](docs/ai/AI_PRINCIPLES.md)
- [ATS methodology](docs/ats/ATS_METHODOLOGY.md)
- [Decision records](docs/adr/README.md)
- [Requirements traceability](docs/exec-plans/REQUIREMENTS_TRACEABILITY.md)
- [Contributor guide](CONTRIBUTING.md)

## License

Vitae Stack is licensed under the [GNU Affero General Public License v3.0](LICENSE). The rationale is recorded in [ADR-0001](docs/adr/0001-agpl-3-license.md). This is project documentation, not legal advice.
