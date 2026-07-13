# AI system

AI is a set of narrow, schema-bound tasks, not an autonomous agent. Deterministic application code selects authorized context, builds task envelopes, validates output, verifies evidence, and decides persistence.

```mermaid
sequenceDiagram
  participant D as Domain service
  participant T as Task registry
  participant P as Provider adapter
  participant M as Model endpoint
  D->>T: task version + authorized inputs
  T->>T: minimize/redact, render prompt, attach schema
  T->>P: normalized request + timeout
  P->>M: provider-specific request
  M-->>P: untrusted output/usage/refusal
  P-->>T: normalized response
  T->>T: JSON parse + Zod + semantic/citation checks
  alt valid
    T-->>D: typed output + manifest hashes
  else repairable and attempts remain
    T->>P: bounded validation-error repair
  else invalid/refused/timeout
    T-->>D: typed failure; no partial persistence
  end
```

Task inputs identify facts with immutable IDs and delimited data. Prompts state that imported/model text is untrusted and cannot issue instructions. Outputs cannot call tools or fetch arbitrary context. Maximum two repair attempts share one job budget; only safe schema error paths are sent back, never secrets. Provider-native structured output is preferred, but local validation is always mandatory.

Career extraction proposes facts; requirement extraction proposes requirements. Retrieval has deterministic filters/lexical candidates; a model may rerank candidate IDs but cannot invent candidates. Tailoring emits claims/suggestions with evidence IDs. ATS scoring remains deterministic; model explanation consumes findings only.

See [task catalog](../ai/TASK_CATALOG.md), [prompt architecture](../ai/PROMPT_ARCHITECTURE.md), and [provenance](PROVENANCE_MODEL.md).

## Implemented M07 boundary

Career-fact extraction starts with the bounded local document parser. A user may keep the deterministic line-based review or explicitly select a tested AI-01 provider/model after reviewing the destination and transmission preview. AI-01 can classify and group only exact single-line UTF-16 source slices; it cannot paraphrase, normalize, approve evidence, call tools, or add unsupported text. Closed-schema and exact-slice validation run before a transaction rechecks the source hash and creates pending proposals. Invalid/refused/timeout output creates no partial batch and leaves the deterministic path available. Multi-entry grouping is a proposal property, while an explicit user-selected existing career entry always takes precedence at approval.

## Implemented M13 boundary

Resume tailoring sends AI-05 and AI-06 through the M12 provider-neutral task runner. The application pins the current resume version, latest reviewed job/requirement/match revisions, selected active career entries, included direct/combined approved evidence, provider configuration, preferences, and lock hashes before any provider call. Job and evidence text remain delimited untrusted data; the system prompt contains no imported content. JSON Schema and Zod validate shape, then deterministic postvalidators enforce identifier subsets, exact claim offsets, complete factual coverage, strong match membership, numeric preservation, lexical entailment, and lock/base hashes. A failed section plan marks the run failed without partial suggestions; an invalid block result records a gap and cannot reach review. Accepted document mutation remains M15 scope.

M14 reuses the same run and provenance contract for cover letters. AI-07 sees bounded job text but returns no prose; it can only select eligible body-block, accepted-requirement, and pinned-evidence IDs. AI-08 does not receive the raw job snapshot and can produce only fully claim-covered career paragraphs. Generic salutation and closing suggestions come from two exact repository-owned phrases and are persisted with empty claim sets; persistence accepts them only for the matching cover-letter section and task version. Factual company/role language is intentionally not generated in the MVP because no reviewed job-span claim source is yet represented in document-version provenance.
