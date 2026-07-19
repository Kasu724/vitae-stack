# ADR-0010: Use deterministic, explainable ATS scoring

- **Status:** Superseded by [ADR-0023](0023-ai-only-ats-analysis.md)
- **Date:** 2026-06-28

## Context

Users value parsing/alignment feedback, but proprietary ATS behavior is unknown and LLM-generated scores are irreproducible and misleading.

## Decision

Implement versioned pure rules over canonical content, export parse-back, reviewed requirements, and provenance. Publish category weights/math/findings/limitations. AI may explain immutable findings but never affect rule, severity, applicability, or score. Low evaluated coverage suppresses overall score; unsupported claims are an independent export blocker.

## Alternatives considered

LLM-only scoring is nondeterministic and opaque. Keyword percentage alone encourages stuffing. No aggregate score avoids false precision but makes comparison harder; detailed categories/coverage and risk bands mitigate this.

## Consequences

Reports are testable and reproducible. Rules require fixtures, versioning, calibration, locale limitations, and careful copy. They will not match every employer system.

## Security and privacy implications

Analysis can remain local and avoids sending content to a model. Rules must not encode protected-class/prestige judgments. Malicious hidden keywords and unsupported claims are detected rather than rewarded.

## Revisit conditions

Evidence shows the overall number causes more harm than utility, new locales require distinct rulesets, or transparent research supports calibrated changes.
