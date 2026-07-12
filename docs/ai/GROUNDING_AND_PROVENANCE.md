# Grounding and provenance

Grounding starts before the model: only facts that are approved, active, same-workspace, selected for the run, and relevant candidates enter context. Facts include typed normalized values and immutable IDs. The model must reference IDs; quoted source text alone is not a citation.

## Claim contract

Every factual span in AI-06/AI-08 output must have at least one evidence ID. Deterministic checks cover ID membership, fact lifecycle, dates, quantities/units, entity names, mutually exclusive facts, and locked text. A separate grounded-entailment evaluator may flag semantic mismatch, but uncertain results fail closed for final insertion and are shown as a proposal requiring evidence review.

Evidence strength is `direct` (one fact entails claim), `combined` (several facts jointly entail it), or `weak` (relevant but insufficient). Weak evidence cannot support a generated factual assertion; it may support a gap explanation. Requirements may have no matches without reducing evidence integrity.

## Lifecycle

Approval creates a fact; correction supersedes it; withdrawal excludes it from future runs. Existing versions preserve their original evidence link and display current status. Manual changes use block/offset/hash diffs: unchanged spans keep provenance, changed factual spans become unverified, and users must link evidence or approve a new fact. Final exports require current support.

Provenance records task/prompt/schema/provider/model versions, source/base/job revisions, selected IDs, output hash, suggestion decision, and document version. It intentionally excludes secret values and raw prompts. See [architecture contract](../architecture/PROVENANCE_MODEL.md).

M13 implements the pre-acceptance half of this contract for resumes. Run preparation admits only explicitly included `direct` or `combined` matches whose facts remain approved and whose entries remain active. The immutable manifest pins content/job hashes, task/prompt-policy versions, preferences, lock hashes, and all derived protected block IDs. AI-06 output must cover every non-punctuation character with non-overlapping claims, cite only pinned evidence with strong support for a cited accepted requirement, preserve every numeric token exactly, and meet the deterministic lexical-entailment threshold. Suggestions are inspectable but do not create document claims until M15 acceptance.

M14 applies the same pre-acceptance contract to AI-08 cover-letter paragraphs. AI-07 is deliberately ID-only, and AI-08 receives no raw company/job prose. Exact deterministic salutation/closing phrases are classified as nonfactual and carry no evidence links; persistence rejects any alternative text under that classification. Company-specific factual prose remains a manual, unverified edit unless a later reviewed-evidence flow supports it, so it cannot be silently presented as grounded.
