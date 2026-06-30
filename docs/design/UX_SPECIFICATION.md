# UX specification

## Global interaction model

Every mutation shows whether it changes a draft, creates an immutable version, sends data to a model, or deletes data. Long operations create a job with queued/running/succeeded/failed/cancelled state; navigation does not discard committed work. Destructive and external-transmission actions require scoped confirmation.

## Screen specifications

| Screen                      | Primary content and actions                                    | Required safety/accessibility behavior                                                                     |
| --------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Onboarding                  | Deployment mode, profile, optional import/provider             | Explain trusted-local limits and provider data destination; defer provider without blocking manual use     |
| Dashboard                   | Verification queue, recent docs/jobs, gaps, failed jobs        | No opaque “career score”; cards have headings and direct actions                                           |
| Career Information Bank     | Filtered entries/facts/skills/sources                          | Status and provenance visible; bulk actions summarize consequences                                         |
| Career-entry editor         | Typed fields, facts, skills, dates, attachments                | Date ambiguity explicit; saving an approved change offers supersede, not overwrite                         |
| Document library            | Resume/letter list, version, tags, archive                     | Source vs tailored lineage; no delete hidden behind archive                                                |
| Import/extraction review    | Source preview and proposal list                               | Proposal is never styled as approved; proven line/page/span locator; approve/edit/reject/duplicate actions |
| Job-description input       | Text, HTTPS URL, or file tabs                                  | URL safety errors actionable without exposing network details; preview immutable snapshot                  |
| Job analysis                | Job metadata, categorized requirements, ambiguities            | User can correct type/priority/source span; correction creates reviewed snapshot                           |
| Requirement-evidence matrix | Requirements as rows, evidence/gaps as details                 | Strength is textual plus visual; keyboard row navigation; no-match is explicit                             |
| Tailoring setup             | Source versions, entries/facts, exclusions, locks, preferences | Data-to-provider preview; cost/token estimate when available; locked-content summary                       |
| Resume editor               | Sections, content, suggestions, evidence inspector             | Claim status in text and accessibility tree; atomic accept/reject; stale suggestions disabled              |
| Cover-letter editor         | Paragraph outline/content, suggestions, evidence               | Same provenance rules as resume; salutation/company assumptions never invented                             |
| ATS report                  | Overall estimate, category scores, findings, limitations       | Show calculation/unknowns; no hiring probability; score is not color-only                                  |
| Version history             | Timeline, compare, restore                                     | Restore creates a version; diff includes provenance/status changes                                         |
| Export workflow             | Format/template/options, validation, artifact                  | Unsupported facts block final; draft labeling explicit; no external assets                                 |
| Settings                    | Account/session, privacy, deployment, defaults                 | Show telemetry off/default and retention policy                                                            |
| Model providers             | Endpoints, models, task assignment, capability test            | Secret write-only; destination disclosure; SSRF restrictions apply to endpoints                            |
| Data controls               | Import preview, archive export, record/workspace delete        | Reauthentication, impact counts, typed confirmation, deletion receipt                                      |

## Feedback and review

Autosave status uses “Saving”, “Saved locally to server”, or “Save failed”; it never says “final.” Provider operations show task, provider/host, selected data classes, and cancel semantics before starting. Explanations are concise and cite evidence/requirement identifiers through human-readable labels.

Responsive views may rearrange controls but cannot hide evidence, limitations, or destructive consequences. Tables become labeled item lists rather than horizontally clipped grids. See [editor behavior](EDITOR_BEHAVIOR.md) and [error states](ERROR_AND_EMPTY_STATES.md).
