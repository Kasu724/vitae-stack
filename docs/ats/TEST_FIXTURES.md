# ATS test fixtures

Fixtures are synthetic, nonidentifying, versioned, and licensed for repository use. Each fixture has canonical document JSON, optional job JSON, expected applicable rules/findings/category ranges, and rationale.

Required families:

- `parse/single-column-accessible`, `parse/two-column-safe`, `parse/image-only`, `parse/header-contact`, `parse/hidden-keywords`, `parse/unicode-glyphs`, `parse/corrupt-docx`.
- `dates/consistent`, `dates/mixed-formats`, `dates/invalid-range`, `dates/overlap-valid`, `dates/current-role`.
- `alignment/full-direct`, `alignment/partial`, `alignment/no-evidence`, `alignment/required-vs-preferred`, `alignment/equivalent-stated`, `alignment/years-overlap`.
- `content/quantified-supported`, `content/metric-mutated`, `content/redundant`, `content/keyword-stuffed`, `content/clear-unquantified`.
- `provenance/superseded`, `provenance/withdrawn`, `provenance/manual-edit`, `provenance/cross-workspace-id`.

Golden tests assert stable rule IDs, locations, applicability, raw effects, category math, caps, overall math, evaluated coverage, and blockers. Property tests cover score bounds, deterministic ordering, no NaN/division by zero, invariance to harmless whitespace, and monotonicity only where the rule declares it. Export parse-back fixtures run in supported OS/container environments to control font/render drift.

Changing a golden expectation requires a ruleset version change, reviewer rationale, migration note, and regenerated report snapshots—not a blind snapshot update.
