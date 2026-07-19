# AI ATS parsing guidance

AI-11 assesses only the text supplied by the application. For saved resumes, that is the canonical section and block text. For uploads, it is the inert parsed text. The analysis may comment on apparent section labels, contact readability, date consistency, density, ordering, and other text-visible formatting risks.

The task does not receive or inspect a rendered PDF/DOCX artifact, layout coordinates, fonts, images, headers, tables, or remote resources. It must describe these as unknown instead of claiming a specific proprietary parser will accept or reject the document. Export parse-back safety remains part of export verification, not the ATS score.

The model must not penalize lawful personal choices such as omitting a street address or photo. It must not infer missing career facts from formatting and must not recommend adding unsupported facts.
