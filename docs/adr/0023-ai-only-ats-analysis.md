# ADR-0023: Use AI-only ATS analysis with optional job context

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

The product previously generated ATS estimates with repository-owned deterministic rules and limited AI to explaining those fixed results. Product direction now requires one AI analysis workflow that works both with and without a reviewed job source.

## Decision

AI-11 produces the complete ATS estimate. A tested structured-output provider and assigned model are mandatory. The task receives the selected resume text and, when selected, the current reviewed job source as separately delimited untrusted data. Without a job source it returns general parsing, formatting, readability, content, and impact categories. With a job source it also returns job alignment.

The model supplies the overall estimate, category scores and weights, rationales, findings, locations, and remediation. Local code validates a closed schema, exact category set, unique categories, bounded text and arrays, score ranges, and weights totaling 100. Immutable reports record provider configuration, configured model, task version, attempts, input hash, and validated output hash. Identical resume/job/provider/model inputs reuse the stored report.

ATS output remains advisory. It never establishes career facts, changes claim support, bypasses provenance, or controls export eligibility. The application does not retain a deterministic ATS scoring fallback.

## Alternatives considered

Keeping deterministic scoring plus AI explanation conflicts with the requested AI-only product behavior. Running both and blending their scores obscures which system produced the result. Allowing free-form model output makes rendering, auditability, and prompt-injection defenses too weak.

## Consequences

ATS analysis now requires a configured model and may vary when the provider, model, prompt version, or supplied text changes. Local-only use remains possible through Ollama. Reports disclose AI provenance and limitations rather than claiming cross-run numerical reproducibility.

## Security and privacy implications

The UI discloses that resume text and optional job text are sent to the selected provider. Inputs are bounded and delimited as hostile data; output is closed-schema validated and rendered as text. Prompts, resume/job content, and model output are excluded from logs and audit metadata. Model recommendations cannot authorize unsupported factual additions or export.

## Revisit conditions

Revisit if AI-only estimates prove materially misleading, provider latency prevents acceptable use, or evidence supports removing numeric ATS estimates entirely.
