# ATS content-quality rules

These deterministic heuristics assess readability, not a universal writing style.

- `ATS-IMPACT-*`: count bullets with a supported outcome/metric; validate quantities against evidence. Do not demand metrics for duties where none are appropriate.
- `ATS-BULLET-*`: configurable word/character range, verb presence, sentence fragments, nested depth, punctuation consistency, first-person use in resume, and multi-idea complexity. Findings show measured threshold.
- `ATS-REDUND-*`: normalized duplicate and high-overlap bullets within/across sections; cap repeated penalties and exclude intentional skill lists.
- `ATS-UNSUP-*`: factual claim lacks active evidence, cites conflicted/withdrawn facts, or changes a number/date/name. Any occurrence blocks final export.
- `ATS-CLARITY-*`: undefined acronym on first use, vague pronoun, excessive nominalization/hedging, and readability range; findings remain low severity because context matters.

No AI sentiment, personality, prestige, demographic, school/employer ranking, or “culture fit” judgment contributes to the score. Optional AI quality feedback is separate, unscored, and cannot create factual content.

Thresholds are fixture-backed, documented in rule metadata, and configurable only through versioned rulesets—not per-user hidden tuning. The UI permits dismissing advice without rewriting the report history.
