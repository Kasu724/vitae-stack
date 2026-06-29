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
