# Product requirements

All requirements below are MVP unless marked otherwise. Detailed, testable examples are in [acceptance criteria](ACCEPTANCE_CRITERIA.md); delivery mappings are in [traceability](../exec-plans/REQUIREMENTS_TRACEABILITY.md).

## Career data and documents

- **PR-001 Career Information Bank:** A workspace shall own profiles, entries, approved facts, skills, goals, preferences, sources, and reusable documents; users can search, filter, inspect provenance, and export them.
- **PR-002 Structured entries:** Users can create work, internship, project, research, education, certification, award, leadership, extracurricular, volunteering, coursework, publication, accomplishment, metric, skill, and custom entries with typed dates, organization, location, descriptions, and tags where applicable.
- **PR-003 Evidence lifecycle:** Extracted or manually entered facts begin as proposals. Approval creates immutable evidence IDs. Corrections supersede rather than mutate approved facts; withdrawal prevents future use; permanent deletion removes dependent claims/versions according to an explicit impact preview.
- **PR-004 Document library:** Users can store multiple resumes and cover letters, label them, choose source versions, archive them, and save tailored outputs back to the library.
- **PR-005 Versioning:** Every accepted suggestion, manual save, and tailoring result creates an immutable version with parent, author/action, timestamp, and provenance snapshot; users can compare and restore by creating a new version.

## Ingestion and analysis

- **PR-006 Document import:** Accept PDF, DOCX, Markdown, plain text, and versioned project JSON within allowlisted MIME/signature/size limits. Parse on the server without executing embedded content, macros, scripts, links, or templates.
- **PR-007 Extraction approval:** Display proposed entries and facts beside source locators; support edit, approve, reject, and duplicate resolution. Unapproved content cannot ground generation.
- **PR-008 Job input:** Accept pasted text, a public HTTPS URL, or an allowlisted file. Preserve the normalized job snapshot and input provenance.
- **PR-009 Secure URL retrieval:** Resolve and connect only to public addresses, revalidate every redirect, limit bytes/time/redirects/content types, send no user credentials, and return safe diagnostics.
- **PR-010 Requirement extraction:** Produce structured required/preferred qualifications, responsibilities, keywords, seniority, and ambiguities with source spans; validate schema and allow user correction.
- **PR-011 Evidence matching:** Map each requirement to zero or more approved evidence facts with deterministic lexical signals, optional model ranking, confidence/reason, and explicit gaps; users can include/exclude matches.

## Tailoring and editing

- **PR-012 Tailoring setup:** Users select source documents, job snapshot, entries, facts, sections, exclusions, locks, tone, and length before generation. Locked content cannot be changed by suggestions.
- **PR-013 Resume tailoring:** Propose section selection, ordering, bullet revisions, and additions using only selected approved facts, while preserving source version and explaining each change.
- **PR-014 Cover-letter tailoring:** Create an evidence-linked outline and draft using selected approved facts and job requirements; no generated factual claim may lack evidence.
- **PR-015 Claim provenance:** Every factual generated span shall link to one or more immutable evidence IDs and the generating task/run; the link survives accepted edits and document versions.
- **PR-016 Unsupported-claim prevention:** Reject provider output with unknown, withdrawn, conflicting, or semantically insufficient citations. Unsupported factual manual edits remain visibly unverified and block final export until linked to or approved as evidence.
- **PR-017 Suggestion review:** Show atomic changes, explanation, affected text, job rationale, evidence, and conflicts; users can accept/reject individually or in a reviewed group and undo through version creation.
- **PR-018 Manual editing:** Provide keyboard-accessible resume and letter editors with autosaved drafts, explicit version save, plain-text paste, structured sections, and claim-level status. Manual factual changes invalidate affected provenance until re-established.

## Analysis, export, and control

- **PR-019 Estimated ATS analysis:** Run versioned deterministic rules for parsing, headings, contact readability, dates, formatting, qualifications, responsibilities, evidence, keywords, stuffing, impact, clarity, redundancy, and unsupported claims. Show category scores, findings, weights, and limitations; AI may explain but never change a score.
- **PR-020 Export:** Export final PDF, DOCX, Markdown, plain text, and structured JSON where the format supports the content. Use sanitized templates and reproducible rendering; block final export on unsupported factual claims and label any permitted draft artifact.
- **PR-021 Data portability:** Export a documented, versioned archive containing structured data, documents, provenance, settings (excluding secret values), sources when requested, and artifacts when requested; accept compatible project JSON with preview and conflict handling.
- **PR-022 Provider configuration:** Configure OpenAI-compatible and Ollama endpoints per user/workspace, test capabilities, choose models by task, show data destination, and keep credentials server-side encrypted or environment-referenced.
- **PR-023 Deployment:** Support Docker Compose with app, worker, and PostgreSQL; host-mounted private artifacts by default; no required proprietary service. Host development may run app/worker locally against Docker PostgreSQL.
- **PR-024 Privacy controls:** Show what content will be sent to a provider before a task, permit local-only providers, minimize prompts, disable project telemetry by default, and never use user content for project model training.
- **PR-025 Retention and deletion:** Users can remove source binaries while retaining approved facts, delete individual records with dependency impact, or permanently delete a workspace. Active data and artifacts are removed within 24 hours; documented backups expire within 30 days; deletion receipts contain identifiers/status, not content.
- **PR-026 Authentication and authorization:** Password mode uses closed registration, secure sessions, CSRF protection, rate limits, and workspace checks on every object. Trusted-local mode is allowed only when bound to loopback and must fail closed otherwise.

## Quality attributes

- **PR-027 Accessibility:** Core workflows conform to WCAG 2.2 AA and work at 320 CSS px, 200% zoom, keyboard-only, and common screen readers.
- **PR-028 Security:** File, URL, HTML, prompt, model-output, authorization, secret, logging, dependency, and denial-of-service controls meet the documented threat-model acceptance tests.
- **PR-029 Reliability:** Jobs are idempotent, bounded, cancellable where safe, retry only known-transient failures, and expose recoverable states without duplicate versions/artifacts.
- **PR-030 Performance:** Meet the budgets in [performance budgets](../engineering/PERFORMANCE_BUDGETS.md) on reference hardware and representative fixtures.
