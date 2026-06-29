# ATS engine

```mermaid
flowchart TD
  D[Canonical document version] --> P[Deterministic document parser]
  J[Reviewed job requirements] --> A[Alignment rules]
  P --> R[Versioned rule registry]
  A --> R
  E[Claim/evidence graph] --> R
  R --> F[Findings with locations and point effects]
  F --> C[Category scores]
  C --> O[Weighted estimated compatibility]
  F --> X[Optional AI explanation]
  X --> Report[Report display]
  O --> Report
```

Rules are pure functions over canonical typed content, reviewed requirements, and provenance—not rendered PDF guesses unless a format-specific parser check is requested. Each finding has stable rule ID/version, category, severity, location, measured value, threshold, remediation, and score effect. Rules that lack required inputs report `not_evaluated` and leave the denominator; they do not award default points.

Category weights and caps are defined in [scoring rubric](../ats/SCORING_RUBRIC.md). The engine prevents double penalties through rule groups/caps and reports raw/category/overall calculations. A ruleset version plus input hashes makes runs reproducible. AI may paraphrase the already-computed findings but receives no authority to add findings, alter severity, or change numbers.

The output is an estimated compatibility review, not an emulation of Workday, Taleo, Greenhouse, Lever, or any proprietary system and not a prediction of hiring outcome. See [limitations](../ats/LIMITATIONS.md).
