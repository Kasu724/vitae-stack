# Grounding and provenance

Grounding starts before the model: only facts that are approved, active, same-workspace, selected for the run, and relevant candidates enter context. Facts include typed normalized values and immutable IDs. The model must reference IDs; quoted source text alone is not a citation.

## Claim contract

Every factual span in AI-06/AI-08 output must have at least one evidence ID. Deterministic checks cover ID membership, fact lifecycle, dates, quantities/units, entity names, mutually exclusive facts, and locked text. A separate grounded-entailment evaluator may flag semantic mismatch, but uncertain results fail closed for final insertion and are shown as a proposal requiring evidence review.

Evidence strength is `direct` (one fact entails claim), `combined` (several facts jointly entail it), or `weak` (relevant but insufficient). Weak evidence cannot support a generated factual assertion; it may support a gap explanation. Requirements may have no matches without reducing evidence integrity.

## Lifecycle

Approval creates a fact; correction supersedes it; withdrawal excludes it from future runs. Existing versions preserve their original evidence link and display current status. Manual changes use block/offset/hash diffs: unchanged spans keep provenance, changed factual spans become unverified, and users must link evidence or approve a new fact. Final exports require current support.

Provenance records task/prompt/schema/provider/model versions, source/base/job revisions, selected IDs, output hash, suggestion decision, and document version. It intentionally excludes secret values and raw prompts. See [architecture contract](../architecture/PROVENANCE_MODEL.md).
