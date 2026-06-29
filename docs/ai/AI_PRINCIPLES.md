# AI principles

1. Models propose; deterministic code authorizes, validates, scores, and persists.
2. Every factual generated claim cites one or more selected, approved, immutable evidence facts.
3. Absence, ambiguity, or conflict is an output condition—not permission to infer.
4. Imported documents, job text, templates, and model output are untrusted data and cannot change instructions or invoke tools.
5. Tasks are narrow, versioned, schema-bound, bounded in tokens/time/retries, and independently evaluable.
6. Context is minimized to the task and disclosed destination. Secrets and unrelated career data are excluded.
7. Provider capability differences cannot weaken local schema, provenance, lock, or export gates.
8. Deterministic methods handle authorization, candidate filtering, metrics/dates, claim ID validity, ATS scoring, diffs, locks, and deletion.
9. AI explanations label uncertainty and never convert an estimate into a guarantee.
10. Users can decline AI, use a local endpoint, correct outputs, and inspect task/provider/model versions.

The project does not train or fine-tune models on user content. External provider processing is governed by that provider; the UI discloses the configured host and links to operator-supplied policy before transmission. See [grounding](GROUNDING_AND_PROVENANCE.md) and [failure modes](FAILURE_MODES.md).
