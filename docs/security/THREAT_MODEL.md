# Threat model

## Assets and actors

Assets are career/job content, evidence integrity, identities/sessions, provider credentials, exports, storage/database, availability, and project supply chain. Actors include unauthenticated attackers, malicious users in another workspace, compromised job sites/files/providers, dishonest templates/dependencies, curious operators, and accidental user/admin actions. Host-root compromise is outside application containment; documentation must not imply otherwise.

## Threat register

| ID  | Threat                                           | Primary controls                                                                                                               | Verification                             |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| T01 | Malicious/oversized upload, decompression bomb   | allowlist, signature/MIME, hard byte/page/entry/ratio limits, quarantine, isolated parser                                      | hostile fixture and resource-limit tests |
| T02 | Parser exploit                                   | no network, least privilege, read-only input, temp isolation, timeout, dependency patching                                     | crash/sandbox regression, SCA            |
| T03 | Stored/reflected XSS or model-output injection   | canonical text model, contextual escaping, sanitization, CSP, no trusted raw HTML                                              | payload E2E/property tests               |
| T04 | CSRF                                             | SameSite cookie, origin/token validation, no unsafe GET mutation                                                               | cross-origin tests                       |
| T05 | SSRF, redirects, DNS rebinding, private networks | HTTPS policy, canonical URL, resolve/validate all IPs, pinned connection, per-hop validation, no auth/cookies, egress firewall | redirect/DNS/IP corpus                   |
| T06 | Prompt injection in documents/jobs               | instruction/data separation, no tools, candidate allowlist, schema/provenance validation                                       | adversarial task evals                   |
| T07 | IDOR/cross-user or cross-workspace exposure      | workspace-scoped service/repository, opaque IDs, composite constraints, indistinguishable 404, download auth                   | two-workspace matrix tests               |
| T08 | Secret leakage                                   | write-only encrypted credentials, env references, redaction, no client/log/prompt, secret scan                                 | log snapshots, API tests, scanning       |
| T09 | Sensitive logs/telemetry                         | allowlisted structured fields, telemetry off, retention                                                                        | log schema tests                         |
| T10 | Untrusted exported HTML/templates                | repository-owned non-executable templates, escaping, no network/scripts, attachment delivery                                   | malicious-content render tests           |
| T11 | Supply-chain compromise                          | lockfile, pinned actions/images, review, Dependabot, provenance/SBOM, minimal dependencies                                     | SCA and release checks                   |
| T12 | Denial of service/cost exhaustion                | quotas, rate/concurrency/size/time/token limits, queue leases, circuit breakers                                                | load/fault tests                         |
| T13 | Improper deletion/backups                        | dependency preview, freeze/idempotent erase/verify, 24h active and 30d backup SLA                                              | deletion/restore drills                  |
| T14 | Malicious template                               | no uploaded executable templates in MVP; schema-only tokens/assets                                                             | schema/fuzz tests                        |
| T15 | Session/account attack                           | benchmarked scrypt, secure cookies, rotation/revocation, rate limits, generic errors, recent reauth                            | auth abuse suite                         |
| T16 | Race/stale write corrupts provenance             | optimistic revision, aggregate transaction, immutable facts/versions, idempotency                                              | concurrency tests                        |

## Residual risk

Complex parsers and headless rendering remain high-risk dependencies; sandbox quality varies by host. Operators can access host storage/database unless they add external encryption/controls. Remote providers see intentionally sent task data. ATS and semantic entailment are imperfect. These are disclosed and mitigated, not represented as eliminated.

Threat modeling is reviewed for each milestone touching a trust boundary and before every release. New threats receive an ID, owner, tests, and risk-register entry.
