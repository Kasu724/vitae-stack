# ATS test fixtures

Fixtures are synthetic, nonidentifying, versioned, and licensed for repository use. Each fixture has canonical document JSON, optional job JSON, expected applicable rules/findings/category ranges, and rationale.

Required families:

- `parse/single-column-standard`, `parse/two-column-safe`, `parse/image-only`, `parse/header-contact`, `parse/hidden-keywords`, `parse/unicode-glyphs`, `parse/corrupt-docx`.
- `dates/consistent`, `dates/mixed-formats`, `dates/invalid-range`, `dates/overlap-valid`, `dates/current-role`.
- `alignment/full-direct`, `alignment/partial`, `alignment/no-evidence`, `alignment/required-vs-preferred`, `alignment/equivalent-stated`, `alignment/years-overlap`.
- `content/quantified-supported`, `content/metric-mutated`, `content/redundant`, `content/keyword-stuffed`, `content/clear-unquantified`.
- `provenance/superseded`, `provenance/withdrawn`, `provenance/manual-edit`, `provenance/cross-workspace-id`.

Golden tests assert stable rule IDs, locations, applicability, raw effects, category math, caps, overall math, evaluated coverage, and blockers. Property tests cover score bounds, deterministic ordering, no NaN/division by zero, invariance to harmless whitespace, and monotonicity only where the rule declares it. Export parse-back fixtures run in the supported bundled/runtime environments to control font/render drift.

Changing a golden expectation requires a ruleset version change, reviewer rationale, migration note, and regenerated report snapshots—not a blind snapshot update.

## Implemented M16 coverage

`tests/ats/engine.test.ts` currently proves the 100-point/15-category registry, complete-category applicability, deterministic repeat, direct versus combined evidence credit, fail-closed untracked/unsupported-claim blocking, low-coverage score suppression, and score bounds under adversarial repetition. `tests/integration/ats.integration.test.ts` exercises clean-schema persistence, complete input pinning, idempotent reuse, workspace isolation, and database immutability. The default browser journey generates and reads a report; the explicit narrow viewport matrix is M20 release evidence and must be recorded separately.

The export-only parse-back families (image-only PDF, glyph loss, rendered text order, hidden export text, corrupt generated DOCX, and platform font drift) belong to M17 and must be added to `test:exports`; they are not claimed as passing in M16.
