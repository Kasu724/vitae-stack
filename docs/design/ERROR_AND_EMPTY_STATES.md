# Error and empty states

Errors state what happened, what was preserved, and the next safe action. User-visible messages use correlation IDs but never stack traces, private addresses, file paths, prompts, source text, provider keys, or another object's existence.

| Situation                            | Required behavior                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Empty CIB                            | Explain approved evidence requirement; offer manual entry/import sample-free actions                       |
| No documents/jobs                    | Offer create/import or paste; do not show fake examples as user data                                       |
| No evidence match                    | Preserve requirement as a gap; offer search/link/add fact, never generation                                |
| Invalid/hostile file                 | Quarantine/delete temporary bytes; identify safe reason category and supported limits                      |
| URL blocked                          | Say the URL cannot be fetched under public-network policy; allow paste/upload; hide resolved IPs           |
| Parser partial result                | Mark missing pages/sections and require review; do not imply completeness                                  |
| Provider unavailable/timeout/refusal | Preserve setup and idempotency key; retry, change provider, or continue manually; no fabricated fallback   |
| Invalid model schema/citation        | Discard output, show task failure and retry path; do not render raw model content                          |
| Save conflict                        | Keep local draft, show compare and resolution; never overwrite server content silently                     |
| Unsupported claim                    | Identify affected span and offer evidence actions; final export stays disabled                             |
| ATS AI unavailable                   | Explain that a tested AI-11 provider/model is required; keep editing and export controls available         |
| Export failure                       | Keep version and validated settings; retry safely; expire partial artifact                                 |
| Delete failure                       | Keep workspace write-blocked only when deletion actually began; show operation status and recovery contact |

Validation summaries link to fields; focus moves to the summary only after submission. Background errors announce once through a polite live region, with assertive announcements reserved for data-loss/security-critical state. Retry buttons are disabled while the same idempotent operation is active.
