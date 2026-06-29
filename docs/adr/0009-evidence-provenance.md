# ADR-0009: Require immutable claim-to-evidence provenance

- **Status:** Accepted
- **Date:** 2026-06-28

## Context

The core promise requires proving which approved facts support each factual claim across generation, review, editing, and versioning. Model-provided citations alone are not trustworthy.

## Decision

Represent factual spans as immutable `GeneratedClaim` records per document version and join them to immutable `EvidenceFact` IDs through `ClaimEvidence`. Deterministic ID/value/date/conflict/entailment checks validate links. Editing maps unchanged spans and marks changed factual spans unverified; final export requires support.

## Alternatives considered

Document-level source lists are too coarse. Inline footnotes pollute career documents and can be removed. Mutable links rewrite history. Trusting model rationales permits hallucinated citations.

## Consequences

Users can inspect evidence and historical decisions; changes require span mapping and provenance-aware diffs. Storage/query complexity grows. False-negative grounding checks may require user review rather than automatic insertion.

## Security and privacy implications

Same-workspace constraints prevent citation ID exfiltration. Provenance manifests avoid raw prompts/secrets. Deletion has visible dependent impact and must remove or invalidate claims safely.

## Revisit conditions

Span anchors prove unstable in user studies, richer token/semantic anchoring is needed, or evidence deletion law/policy requires alternative tombstone behavior.
