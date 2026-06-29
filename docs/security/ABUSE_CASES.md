# Abuse cases

- **ACASE-01 — Cross-tenant guessing:** attacker enumerates opaque IDs/download routes. Return indistinguishable 404, scope every query/key/job, rate-limit; verify two-workspace matrix.
- **ACASE-02 — Resume as exploit:** file contains parser payload, bomb, external relationship, or prompt instruction. Quarantine/sandbox/limit; treat output as data; verify malicious corpus.
- **ACASE-03 — Job URL targets infrastructure:** URL/redirect/rebinding reaches metadata, localhost, database, or Ollama. Resolve/pin/revalidate and egress deny; verify simulated DNS/redirect suite.
- **ACASE-04 — Model invents credential:** provider cites unknown fact or mutates metric. Closed schema and semantic/provenance gate discard it; final export blocks.
- **ACASE-05 — User pressures unsupported claim:** user asks model to add degree/skill. Explain evidence requirement; allow explicit new-fact approval, never silent insertion.
- **ACASE-06 — Output XSS:** model/job emits tags, event handlers, URLs, bidi/control text. Typed plain-text nodes, escaping/sanitization/CSP; test every render/export surface.
- **ACASE-07 — Cost/availability attack:** repeated imports/generation/export. Per-user quotas, size/token/deadline/concurrency limits, idempotency, queue fairness, circuit breakers.
- **ACASE-08 — Secret harvesting:** error/provider response asks for keys or logs headers. Secrets remain adapter-only/write-only; allowlisted logs and response sanitization.
- **ACASE-09 — Malicious template:** upload template runs code/loads tracking pixels. MVP rejects user templates; repository templates are schema-reviewed and networkless.
- **ACASE-10 — Delete another user or hide evidence:** crafted ownership/dependency request. Recent reauth, server-derived workspace, transactional impact plan, immutable audit metadata.
- **ACASE-11 — Poison project fixtures:** contributor submits real resumes or adversarial dependency/action. Synthetic-data policy, review, pinned actions, license/provenance check.
- **ACASE-12 — Operator misconfiguration:** trusted-local exposed publicly or artifact directory served. Startup fail-closed, health/config diagnostics, deployment checks, documented secure defaults.

Each implementation milestone names applicable abuse cases and adds an automated or manual verification. Novel abuse paths update the threat model and risk register before release.
