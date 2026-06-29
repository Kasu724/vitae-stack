# ADR-0005: Support password and loopback trusted-local modes

- **Status:** Accepted
- **Date:** 2026-06-28

## Context

Personal self-hosters need simple setup; shared/remote deployments need real identity and tenant isolation. Public registration, OAuth, and mandatory email infrastructure add MVP complexity.

## Decision

Use Better Auth email/password with database sessions, closed registration, bootstrap admin, secure cookies, CSRF defenses, rate limits, session revocation, and recent reauthentication. One user owns one workspace in MVP; a deployment may have multiple isolated users. `trusted-local` bypasses login only for one user/workspace on verified loopback and fails startup otherwise.

## Alternatives considered

No auth is unsafe beyond localhost. Mandatory external OIDC/auth SaaS breaks simple/offline self-hosting and creates lock-in. Hand-rolled sessions/passwords are avoidable risk. Magic links require reliable email. Public signup expands abuse and account recovery.

## Consequences

Personal and small shared deployments use one code/data model. Operators need bootstrap/reset procedures; email verification/reset is optional when SMTP exists. Future OIDC can map into membership/session contracts.

M03 implemented password mode for host and Compose deployments and trusted-local mode for a host process bound to loopback. The reference Compose file remains password mode because a container must listen beyond its own loopback to reach a host-published port; weakening the startup guard for that topology is not accepted. An explicit claim command converts the local identity in place before switching modes.

## Security and privacy implications

Trusted-local exposure is catastrophic, so configuration fails closed. Password hashes, tokens, cookies, enumeration, CSRF, fixation, brute force, and reauth receive dedicated tests. Auth records remain separate from career content.

## Revisit conditions

Demand for organization SSO/passkeys, Better Auth support/security failure, or safe desktop packaging that changes local trust assumptions.
