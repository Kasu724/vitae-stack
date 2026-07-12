# ATS job-alignment rules

Alignment uses user-reviewed job requirements and approved evidence. It does not infer that a missing keyword means a missing skill, nor that keyword presence proves qualification.

- `ATS-REQ-*`: required qualification coverage is the importance-weighted fraction with at least one direct supported claim. Weak/implicit matches receive partial or no credit and are listed.
- `ATS-PREF-*`: preferred coverage uses the same method at lower category weight.
- `ATS-RESP-*`: responsibilities map to supported bullets/paragraphs using normalized verbs, objects, domain terms, and reviewed evidence matches; repetition is capped.
- `ATS-EVID-*`: direct evidence earns full rule credit, combined evidence bounded credit, weak/no/conflicted/withdrawn evidence no credit. Unsupported claims trigger blockers.
- `ATS-KEY-*`: canonicalized exact phrase, acronym expansion, and controlled synonym matches; show matched document location and requirement source. User can inspect synonym rules.
- `ATS-STUFF-*`: repeated normalized term frequency, unnatural consecutive repetition, hidden text, and dense keyword lists compared with document length/section type.

Required and preferred requirements remain separate. Legal/credential requirements are exact-match only unless user-reviewed equivalence exists. Years-of-experience calculations use approved dated entries and never sum overlapping periods blindly. “Equivalent experience” is not assumed unless the job text states it.

Each unmatched requirement is a gap, not an invitation to generate it. A user may decide the job is a poor fit; the product does not pressure them to fabricate coverage.
