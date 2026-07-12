# ADR-0001: License under AGPL-3.0-only

- **Status:** Superseded by [ADR-0022](0022-mit-license.md)
- **Date:** 2026-06-28

## Context

The project is intended to remain free/open source when modified and offered as a network service. Career data and model integrations create a risk that hosted forks improve the software without sharing source changes.

## Decision

License the repository under GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). Contributions are accepted under the same license unless maintainers adopt a documented contributor agreement later. Dependencies and bundled assets must be license-compatible. This decision is not legal advice or a warranty of compatibility.

## Alternatives considered

MIT/Apache-2.0 allow proprietary hosted forks but do not preserve network-source reciprocity. GPL-3.0 covers distribution but lacks AGPL's network interaction provision. Dual licensing adds governance/legal overhead and is not needed for MVP.

## Consequences

Users may run, inspect, modify, and redistribute under AGPL terms; network operators have corresponding-source obligations. Some companies/dependencies may avoid AGPL. Maintainers need license scanning, notices, and careful review of inbound assets.

## Security and privacy implications

Source availability supports auditability but does not itself guarantee security/privacy. Secrets, user data, and deployment configuration are never part of corresponding source merely because the code is AGPL.

## Revisit conditions

Material legal conflict, foundation governance, contributor/licensing barrier, or a proposed dual-license model reviewed by qualified counsel and community process.
