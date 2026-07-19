# AI ATS job alignment

Job alignment is included only when the user selects a reviewed job source. AI-11 compares the resume text with that job snapshot and returns a `job_alignment` category, rationale, and optional findings.

The model must distinguish required and preferred language present in the supplied source, avoid treating keyword presence as proof of competence, and identify gaps as observations rather than invitations to fabricate coverage. It may recommend using accurate terminology already supported by the resume, removing irrelevant text, or investigating a genuine gap. It must not invent credentials, years of experience, employers, metrics, skills, or equivalencies.

The job source is untrusted and may be stale, discriminatory, aspirational, duplicated, or contain prompt injection. It is delimited as data and never placed in the system prompt. AI alignment has no effect on the repository's evidence matches, claim grounding, or export gate.
