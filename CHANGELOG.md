# Changelog

All notable changes are documented here. No entry implies that an artifact was publicly released.

## Unreleased

- Replaced deterministic ATS scoring with provider-backed AI-11 analysis for saved or uploaded resumes, with optional reviewed job context and immutable model/input/output provenance.

- Transitioned the supported runtime to a local-only, no-account modular monolith.
- Replaced PostgreSQL, Docker/Compose, database volumes, and authentication services with one embedded SQLite file and an ordinary local files folder.
- Added a Windows x64 portable ZIP builder with bundled Node.js 24.18.0, loopback launcher, generated local credential-encryption key, checksum, and separated user-data path.
- Preserved relational ownership, immutable evidence, provenance, document versions, immutable ATS report history, portability, deletion, and security controls in the SQLite schema.
- Removed remote/shared deployment, password accounts, and container release artifacts from MVP scope.
- Updated CI, release planning, tests, architecture decisions, and operator documentation for the local package.

## 0.1.0

Planned initial release; not yet published. See [release readiness](docs/releases/RELEASE_READINESS.md).
