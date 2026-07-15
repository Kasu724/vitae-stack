# UX specification

## Global interaction model

Every mutation should show whether it changes a draft, creates an immutable version, sends data to a model, or deletes data. Implemented queued fetch/parser/deletion operations expose bounded recoverable states; synchronous operations report success or an actionable error. Navigation does not discard committed work. Destructive and external-transmission actions require scoped confirmation.

## Screen specifications

| Screen                      | Primary content and actions                                    | Required safety and interaction behavior                                                                                                                   |
| --------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First-use landing           | Automatically provisioned local workspace and workflow links   | Explain loopback/local-storage limits; provider setup remains optional                                                                                     |
| Dashboard                   | Verification queue, recent docs/jobs, gaps, failed jobs        | No opaque “career score”; cards have headings and direct actions                                                                                           |
| Career Information Bank     | Filtered entries/facts/skills/sources                          | Active/Archived tabs precede entry cards; status/provenance visible; named deletion confirmations show dependent counts and saved-claim blockers           |
| Career-entry editor         | Typed fields, facts, skills, dates, attachments                | Date ambiguity explicit; saving an approved change offers supersede, not overwrite                                                                         |
| Document library            | Resume/letter list, versions, archive, whole-document delete   | Active/Archived tabs precede document cards; named preview covers full history/derived records/export bytes; no individual-version deletion                |
| Import/extraction review    | Source preview and proposal list                               | Proposal is never styled as approved; proven line/page/span locator; checkbox selection with bulk approve/reject confirmation; edit/duplicate actions      |
| Job-description input       | Text, HTTPS URL, file tabs, and saved-job cards                | Active/Archived tabs precede saved-job cards; URL errors are safe; deletion names every job, previews derived records, and shows accepted-version blockers |
| Job analysis                | Job metadata, categorized requirements, ambiguities            | User can correct type/priority/source span; correction creates reviewed snapshot                                                                           |
| Requirement-evidence matrix | Requirements as rows, evidence/gaps as details                 | Strength is textual plus visual; no-match is explicit                                                                                                      |
| Tailoring setup             | Source versions, entries/facts, exclusions, locks, preferences | Data-to-provider preview; cost/token estimate when available; locked-content summary                                                                       |
| Resume editor               | Sections, content, suggestions, evidence inspector             | Claim status is explicit; atomic accept/reject; stale suggestions disabled                                                                                 |
| Cover-letter editor         | Paragraph outline/content, suggestions, evidence               | Same provenance rules as resume; salutation/company assumptions never invented                                                                             |
| ATS report                  | Overall estimate, category scores, findings, limitations       | Show calculation/unknowns; no hiring probability; score is not color-only                                                                                  |
| Version history             | Timeline, compare, restore                                     | Restore creates a version; diff includes provenance/status changes                                                                                         |
| Export workflow             | Format/template/options, validation, artifact                  | Unsupported facts block final; draft labeling explicit; no external assets                                                                                 |
| Settings                    | Privacy, local deployment, portability/deletion, providers     | State that telemetry is absent/off and describe actual local retention                                                                                     |
| Model providers             | Endpoints, models, task assignment, capability test            | Secret write-only; destination disclosure; SSRF restrictions apply to endpoints                                                                            |
| Data controls               | Import preview, archive export, record/workspace delete        | Named atomic record confirmation; typed workspace confirmation; accurate retry states and content-free receipt                                             |

## Feedback and review

Autosave status uses “Saving”, “Saved locally to server”, or “Save failed”; it never says “final.” Provider operations show task, provider/host, selected data classes, and cancel semantics before starting. Explanations are concise and cite evidence/requirement identifiers through human-readable labels.

Responsive views may rearrange controls but cannot hide evidence, limitations, or destructive consequences. Tables become labeled item lists rather than horizontally clipped grids. See [editor behavior](EDITOR_BEHAVIOR.md) and [error states](ERROR_AND_EMPTY_STATES.md).
