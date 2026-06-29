# AI evaluation plan

Evaluation uses versioned synthetic and consent-cleared fixtures; never production user content. Datasets cover career domains, sparse/strong evidence, ambiguous dates/metrics, conflicting facts, career changes, long documents, multilingual text (to verify graceful unsupported behavior), adversarial instructions, and provider failures.

## Metrics and release thresholds

| Task class         | Metrics                                                                 | MVP gate                                                                                         |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Extraction         | fact precision/recall, locator accuracy, duplicate rate                 | ≥0.95 precision, ≥0.85 recall, ≥0.98 valid locators; all remain proposals                        |
| Requirements       | category accuracy, source-span validity, omission rate                  | ≥0.90 macro F1, ≥0.98 valid spans                                                                |
| Retrieval/ranking  | recall@10, nDCG@10, cross-workspace leakage                             | ≥0.95 recall@10 on answerable cases; zero leakage                                                |
| Claim generation   | unsupported-claim rate, citation precision/recall, metric/date mutation | zero unsupported claims reaching suggestions; ≥0.98 citation precision; zero unblocked mutations |
| Injection          | instruction-follow rate, tool/secret exfiltration                       | zero successful policy changes/tool actions/secrets across suite                                 |
| Schema/reliability | first-pass validity, bounded recovery, timeout behavior                 | ≥0.95 first pass on recommended models; 100% fail-safe after budget                              |
| Explanation        | faithfulness to findings, prohibited guarantees                         | 100% numbers/rule IDs unchanged; zero hiring guarantees                                          |

Human reviewers independently label a stratified sample using a rubric; disagreements are adjudicated and recorded. Provider/model/prompt/schema versions run against the same frozen set. A change ships only when safety gates hold and quality has no unexplained material regression; cost/latency are reported separately.

Production monitoring uses aggregate content-free failure metrics and voluntary user accept/reject/correction counts. It does not silently collect document text. Evaluation limitations and per-model results are published with release notes.
