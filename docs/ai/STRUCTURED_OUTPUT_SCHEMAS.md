# Structured output schemas

Zod is the runtime source of truth; JSON Schema is derived for capable providers. Provider-native strict output improves reliability but never replaces local parse, Zod validation, semantic checks, and provenance checks. OpenAI documents that strict structured output supports a subset of JSON Schema, so task schemas use portable objects, enums, arrays, bounded strings/numbers, and `additionalProperties: false` ([official guide](https://platform.openai.com/docs/guides/structured-outputs)).

## Common envelope

```json
{
  "schemaVersion": "ai-06.v1",
  "result": {},
  "gaps": [
    { "code": "MISSING_EVIDENCE", "requirementId": "...", "detail": "..." }
  ],
  "warnings": []
}
```

Identifiers are opaque strings matching IDs supplied in input. Free-form provider IDs, URLs, HTML, tool calls, and extra keys are forbidden. Strings and arrays have task-specific maximum lengths; every object is closed.

## Claim-bearing output

```json
{
  "operation": "replace_block_text",
  "targetBlockId": "block_7",
  "text": "Reduced monthly close time by 20% through automated reconciliations.",
  "claims": [
    {
      "start": 0,
      "end": 74,
      "evidenceFactIds": ["fact_42", "fact_43"],
      "relation": "combines"
    }
  ],
  "requirementIds": ["req_9"],
  "explanation": "Uses verified automation and metric evidence relevant to the role."
}
```

Post-validation verifies Unicode-normalized offsets, complete factual-span coverage, allowed operation/target, base hash, selected IDs, fact status, metric/date equality, conflicts, and semantic entailment. It rejects overlapping/out-of-range spans and factual text outside claim spans.

Invalid JSON/schema output receives up to two repair attempts. Unknown IDs, unsupported claims, prompt/tool injection, or lock violations are hard failures, not repairable warnings. Valid results are stored only inside the transaction that creates their task result/suggestion.
