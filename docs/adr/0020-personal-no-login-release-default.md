# ADR-0020: Personal no-login release default

- **Status:** Superseded by [ADR-0021](0021-local-sqlite-no-account-runtime.md)
- **Date:** 2026-07-02

## Context

Vitae Stack supports password and trusted-local identities, but the original Compose baseline selected password mode and required an operator bootstrap. The primary release audience is an individual running the tool on one computer who should not create an application account, edit secrets, or expose career data to a hosted service. A container still binds its application process to `0.0.0.0` internally, so application configuration cannot equate that bind address with host-network exposure.

## Decision

The downloadable personal package uses `compose.yaml` plus `compose.personal.yaml` through repository-owned launchers. The launcher generates access-restricted local database, session, and credential-encryption secrets; migrates the database; and starts one automatically provisioned trusted-local user/workspace. The host publishes only `127.0.0.1:3000`; PostgreSQL has no host port. The container bind exception requires both trusted-local acknowledgements, a loopback public URL, the dedicated overlay, and automated inspection of the merged Compose configuration. Forwarded or non-loopback request authorities fail closed where the standalone server preserves them.

All canonical data remains in named local PostgreSQL/artifact/queue volumes. Telemetry and remote providers are disabled by default. Ollama is the documented account-free local model option; manual and deterministic workflows do not require a model. Password mode remains the default for shared or remotely exposed self-hosting and is not removed.

## Alternatives considered

- **Keep password bootstrap for everyone:** secure for remote hosting but adds an unnecessary account concept and setup burden to a personal loopback tool.
- **Use trusted-local directly on the host:** preserves a literal loopback process bind but requires Node/pnpm and exposes implementation setup to end users.
- **Ship Electron/Tauri with an embedded database:** potentially simpler later, but introduces a second runtime, database dialect, packaging/security surface, and migration path beyond the MVP.
- **Expose trusted-local on a LAN:** rejected because any local-network client would inherit the sole workspace authority.

## Consequences

Personal users need Docker but no Vitae Stack or cloud account. First launch takes longer because images build locally. The ignored `.vitae-stack/personal.env` file becomes part of local installation state and must be preserved with the named volumes. A source ZIP can be built locally without a registry; public distribution still requires an operator-selected hosting location.

## Security and privacy implications

Loopback host publication is the primary access boundary; the app-level authority check is defense in depth, not a substitute. Changing the overlay port to a wildcard/LAN bind makes trusted-local unsafe. Generated secrets never appear in command output or Git and receive owner-only permissions. Remote AI remains opt-in and discloses its destination/context; public job-URL retrieval is the only default workflow that contacts the supplied external site. Local Docker administrators and host compromise remain outside the application trust boundary.

## Revisit conditions

Revisit if the project ships a signed desktop runtime, Docker cannot provide reliable loopback publication on a supported platform, multiple local OS users require separate workspaces, or a verified embedded PostgreSQL-compatible deployment materially reduces installation risk.
