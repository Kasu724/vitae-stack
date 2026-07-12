# ADR-0022: License under MIT

- **Status:** Accepted
- **Date:** 2026-07-10
- **Supersedes:** [ADR-0001](0001-agpl-3-license.md)

## Context

The project was previously licensed under `AGPL-3.0-only` to preserve source-sharing obligations for modified network-service forks. The current product direction prioritizes local-first user trust, simple adoption, low compliance friction, and broad downstream use over copyleft leverage against hosted or proprietary forks.

Users may encounter unofficial forks or hosted variants. The project will address that risk through transparent architecture, local-first defaults, release provenance, checksums, notices, security guidance, and clear trust documentation rather than through network-source reciprocity obligations.

## Decision

License the repository under the MIT License (`MIT`). Contributions are accepted under the same license unless maintainers adopt a documented contributor agreement later. Dependencies and bundled assets must remain license-compatible. This decision is not legal advice or a warranty of compatibility.

## Alternatives considered

Keeping `AGPL-3.0-only` would preserve network-source reciprocity but increases adoption and contribution friction. Apache-2.0 would add an explicit patent grant, but the project does not currently need the extra license length or policy surface. Dual licensing would add governance and legal overhead that is not needed for MVP.

## Consequences

Users and downstream developers may use, inspect, modify, redistribute, sublicense, and sell copies under MIT terms. Companies and individual contributors are less likely to avoid the project for license reasons. Proprietary forks and hosted variants can exist without publishing their modifications, so users must choose trusted distributions and operators. Maintainers still need license scanning, notices, and careful review of inbound assets.

## Security and privacy implications

The license does not guarantee that a fork is private, secure, or faithful to the project's defaults. Official releases should continue to emphasize local-only operation, provenance, checksums, dependency review, no telemetry by default, and clear warnings that users should inspect or trust the software they run with career data and credentials.

## Revisit conditions

Material legal conflict, foundation governance, contributor/licensing barrier, a need for explicit patent terms, or a future decision to restore copyleft or adopt a reviewed dual-license model.
