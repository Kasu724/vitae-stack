# Release Readiness

Vitae Stack is release-ready only when the repository builds cleanly, the portable package starts on a clean Windows host, and the documented checks pass in the release environment.

## Required Checks

- Format, lint, typecheck, unit, integration, contract, parser, export, portability, deletion, security, smoke, and personal-package tests.
- Production build and package creation.
- Clean extracted-package launch, stop, restart, and persistence check with an isolated data directory.
- Dependency license and advisory review.
- Archive inspection for secrets, user data, local caches, and unsupported deployment files.
- Checksum verification for generated release artifacts.

## Release Notes

No README or package version alone proves a published release. Git tags and GitHub releases are authoritative after maintainer publication.
