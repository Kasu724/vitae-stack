# AI failure modes

| Failure                   | Detection                                | User behavior                                           | Recovery                                             |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| Missing/weak evidence     | Candidate/entailment gate                | Show gap; no claim                                      | Add/approve/link evidence or omit                    |
| Conflicting facts/dates   | Typed conflict rules                     | Identify facts; block dependent claim                   | Supersede/withdraw through CIB                       |
| Ambiguous metric          | Unit/range/timeframe validator           | Preserve qualification or omit                          | User clarifies and approves fact                     |
| Unknown/fabricated ID     | Input-set check                          | Discard output                                          | Retry once only if schema repairable                 |
| Uncovered factual span    | Claim coverage classifier/check          | Discard suggestion                                      | Regenerate or manual grounded edit                   |
| Invalid JSON/schema       | Parser/Zod                               | No partial rendering                                    | Up to two bounded repairs, then manual path          |
| Prompt injection          | Delimiters, canaries, output/tool policy | Ignore and optionally flag source passage               | User can inspect/remove content                      |
| Provider output injection | Safe text model + sanitization           | Render as text only                                     | Reject prohibited markup/operations                  |
| Refusal/content filter    | Adapter status                           | Explain provider declined without exposing raw response | Change model/provider or manual action               |
| Timeout/rate limit/outage | Deadline/status/circuit breaker          | Preserve setup and operation state                      | Bounded retry with backoff; no duplicate persistence |
| Truncation                | Finish reason/schema incompleteness      | Discard incomplete output                               | Reduce context deterministically or split task       |
| Model drift               | Versioned eval regression                | Disable affected task/model recommendation              | Pin/rollback prompt/model alias                      |
| Privacy misconfiguration  | Endpoint disclosure/capability check     | Block unknown/unsafe destination                        | Operator/user corrects endpoint                      |

No failure falls back to unstructured text insertion. A task may succeed partially only when its schema models independent items and each accepted item passes all validation; failures remain visible and do not become evidence.
