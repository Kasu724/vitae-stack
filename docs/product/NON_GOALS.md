# Non-goals

## MVP exclusions

- Applying to jobs, filling web forms, job-board scraping, inbox monitoring, or browser automation.
- Reproducing proprietary ATS algorithms, predicting hiring decisions, ranking people, or promising interviews.
- Inventing missing qualifications, inferred demographics, personality judgments, salary negotiation, or legal/immigration advice.
- Public registration, social login, SSO/OIDC, organization roles, shared workspaces, real-time collaboration, or recruiter pipelines.
- OCR for image-only documents, scanned handwriting, arbitrary office formats, or executable templates/macros.
- Native mobile/desktop applications, offline-first synchronization, or a browser extension.
- Fine-tuning or training on user documents; provider-side training policies remain the user's/provider's contract and must be disclosed before transmission.
- A built-in hosted model, database, object store, email service, analytics service, or deployment control plane.
- Microservices, Kubernetes, event streaming, vector databases, or distributed workflow orchestration in the reference deployment.
- Pixel-identical import/export of arbitrary resumes. Semantic content, accessibility, safety, and deterministic templates take precedence.

## Guardrails on future scope

Future integrations must use the same provider/storage/auth abstractions, workspace boundary, provenance contract, deletion interface, and opt-in data disclosure. Revenue or convenience cannot convert an optional proprietary integration into a default requirement.
