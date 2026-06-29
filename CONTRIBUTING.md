# Contributing

Vitae Stack is currently in the documentation phase. Contributions should make a requirement, decision, risk, or delivery step more implementable without implying that planned software exists.

## Before proposing a change

Read [AGENTS.md](AGENTS.md), the [documentation index](docs/README.md), [product principles](docs/ai/AI_PRINCIPLES.md), [security policy](SECURITY.md), and the relevant ADRs. Search existing issues before opening a new one. Security vulnerabilities must use the private process in `SECURITY.md`, not a public issue.

## Change workflow

1. Open or reference an issue with a testable outcome and requirement/milestone IDs.
2. Create a focused branch; avoid unrelated formatting changes.
3. Update authoritative docs and [traceability](docs/exec-plans/REQUIREMENTS_TRACEABILITY.md) with changed behavior.
4. Add tests when implementation begins. Planned validation commands are listed in [quality gates](docs/engineering/QUALITY_GATES.md).
5. Complete the pull-request template honestly, including commands not run and residual risks.

Commit messages should be imperative and scoped, for example `docs(adr): decide artifact storage`. Pull requests should be reviewable, preserve user data by default, and include migration/recovery notes when state changes.

## Review standard

Maintainers evaluate correctness, evidence grounding, tenant isolation, privacy, accessibility, operational simplicity, testability, and backward compatibility. A feature is not complete because a happy-path UI exists. Generated factual content, destructive actions, URL/file ingestion, and secrets require explicit abuse-case coverage.

By participating, contributors agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions are accepted under the repository license; contributors certify they have the right to submit them.
