# ADR-0014: Make Docker Compose the reference deployment

- **Status:** Accepted
- **Date:** 2026-06-28

## Context

The platform must be self-hostable without proprietary infrastructure and practical for one host, while allowing conventional managed components optionally.

## Decision

Publish nonroot app/worker images and a Compose reference with PostgreSQL and private artifact volume. Operator provides TLS reverse proxy and backups using documented procedures. Development may run app/worker on host with only PostgreSQL in Docker. S3-compatible storage and remote providers are optional interfaces.

## Alternatives considered

Vercel/serverless-first constrains workers/files and creates platform coupling. Kubernetes is excessive. Native-only installs multiply environment drift. An embedded DB weakens parity.

## Consequences

Deployment is inspectable and portable across hosts. Operators remain responsible for TLS, host hardening, backup encryption, upgrades, and provider contracts. Horizontal scale is supported conceptually, not an MVP reference.

## Security and privacy implications

Startup validates secrets/auth/bind/proxy/storage. Containers use minimal privileges/internal networks/resource limits. Trusted-local is not exposed. Backups cover DB and artifacts and must replay deletion tombstones.

## Revisit conditions

Maintained package formats are requested, container runtime becomes a barrier, or validated multi-node demand warrants additional reference architecture.
