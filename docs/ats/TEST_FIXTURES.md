# AI ATS test fixtures

ATS fixtures are synthetic, nonidentifying, versioned, and licensed for repository use. They cover both saved-resume and uploaded-source inputs, with and without a reviewed job source.

Schema tests verify exact job/no-job category sets, unique categories, score ranges, weights totaling 100, bounded strings and arrays, known severities, and rejection of additional keys. Service tests verify AI-11 assignment, provider/model selection, prompt separation, hostile input delimiting, no prompt content in system instructions, input-size limits, immutable input/output hashes, and no provider call when an identical stored report exists.

Integration tests verify workspace isolation, current resume/job hash rechecks, provider/model/task provenance, immutable category rationales and findings, and uploaded-source behavior. Provider contract/security tests cover deadlines, repair bounds, refusals, credentials, endpoint restrictions, and content-free logs. Browser tests verify the AI estimate and limitations display.

Tests do not assert a golden score because the product no longer owns a deterministic ATS scoring algorithm. Evaluation datasets may compare model usefulness and safety, but must not treat model output as a hiring outcome or factual-grounding decision.
