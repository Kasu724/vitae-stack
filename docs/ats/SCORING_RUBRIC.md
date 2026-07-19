# AI ATS output contract

AI-11 supplies the scores and weights; Vitae Stack does not maintain a deterministic scoring rubric or fallback.

Every analysis includes parsing, formatting, readability, content, and impact. An analysis with a reviewed job source also includes job alignment. Each category has an integer score from 0 to 100, a positive integer weight, and a rationale. Category keys are unique and weights must total 100. The model also supplies an integer overall estimate from 0 to 100 and explains it directly; local code does not recompute the number from category scores.

Findings contain one included category, severity, affected-location hint, explanation, and remediation. Findings cannot mark a factual claim supported, unblock export, or authorize adding credentials, experience, metrics, or other career facts absent from approved evidence.

Display copy labels every number as an AI estimate and shows provider/model/task provenance. Numbers from different providers, models, prompt versions, resumes, or job sources are not treated as calibrated or directly comparable.
