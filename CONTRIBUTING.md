# Contributing

Vitae Stack has a working local MVP and is undergoing release-readiness hardening. Contributions may change implementation, tests, operations, or documentation, but must distinguish verified current behavior from plans and must preserve the evidence-grounding, privacy, and local-only invariants.

## Before proposing a change

Read the [project documentation](docs/README.md), [security policy](SECURITY.md), and any issue or discussion that defines the intended behavior. Search existing issues before opening a new one. Security vulnerabilities must use the private process in `SECURITY.md`, not a public issue.

## Change workflow

1. Open or reference an issue with a testable outcome and requirement/milestone IDs.
2. Create a focused branch; avoid unrelated formatting changes.
3. Update public docs and [traceability](docs/exec-plans/REQUIREMENTS_TRACEABILITY.md) with changed behavior.
4. Add or update tests for behavior changes. Validation commands are listed in [quality gates](docs/engineering/QUALITY_GATES.md); report only commands actually run.
5. Complete the pull-request template honestly, including commands not run and residual risks.

Commit messages should be imperative and scoped, for example `docs(adr): decide artifact storage`. Pull requests should be reviewable, preserve user data by default, and include migration/recovery notes when state changes.

## Review standard

Maintainers evaluate correctness, evidence grounding, tenant isolation, privacy, operational simplicity, testability, and backward compatibility. A feature is not complete because a happy-path UI exists. Generated factual content, destructive actions, URL/file ingestion, and secrets require explicit abuse-case coverage.

By participating, contributors agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions are accepted under the repository license; contributors certify they have the right to submit them.
