# Glossary

- **Approved evidence fact:** immutable, normalized statement explicitly accepted by a user and eligible to support factual generation.
- **Career Information Bank (CIB):** a workspace's structured career entries, approved evidence facts, skills, source documents, preferences, and career goals.
- **Claim:** a factual span in a document. Claims are `supported`, `conflicted`, `unverified`, or `nonfactual`.
- **Document:** logical resume or cover letter; content lives in immutable document versions.
- **Evidence locator:** source document, page/paragraph/span, or user-entered record location from which a fact came.
- **Final export:** artifact without a draft warning; allowed only when all factual claims are supported and checks pass.
- **Grounding:** limiting generation to supplied, approved evidence and verifying its citations.
- **Job requirement:** normalized required/preferred qualification, responsibility, or contextual attribute extracted from a job posting.
- **Provenance:** immutable chain from a claim through claim-evidence links to evidence facts and their approval/source history.
- **Suggestion:** proposed operation against a base document version; it is not content until accepted.
- **Tailoring run:** reproducible record of job, source versions, selected facts, provider/task versions, and outputs.
- **Trusted-local mode:** explicit development/personal mode with no login, permitted only on loopback with one workspace.
- **Workspace:** authorization, ownership, export, retention, and deletion boundary.
- **AI ATS estimate:** a model-generated advisory analysis of resume text, optionally against a reviewed job source; not a proprietary ATS result or hiring probability.

See [data model](architecture/DATA_MODEL.md) and [provenance model](architecture/PROVENANCE_MODEL.md) for precise lifecycle rules.
