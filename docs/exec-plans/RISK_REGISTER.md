# Risk register

Likelihood/impact are qualitative for the MVP release candidate. Owners are project roles until maintainers assign names.

| ID   | Risk                                               | L/I        | Mitigation and indicator                                                                                                              | Owner        |
| ---- | -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| R-01 | Model inserts unsupported claim                    | M/Critical | closed schemas, claim coverage, evidence validator, export block; indicator: eval rejection/escape rate                               | AI + product |
| R-02 | Cross-workspace data exposure                      | L/Critical | scoped services/queries/keys, composite constraints, adversarial tests; indicator: authz test/denial anomaly                          | Security     |
| R-03 | Parser compromise/bomb                             | M/High     | quarantine, sandbox, hard limits, patching, malicious corpus; indicator: child resource/crash rate                                    | Platform     |
| R-04 | SSRF/rebinding reaches private service             | M/Critical | pin/revalidate/egress deny, no browser fetch; indicator: blocked-destination tests/events                                             | Security     |
| R-05 | Provider sends/retains sensitive data unexpectedly | M/High     | destination disclosure, minimal context, local option, no provider tools; indicator: config review                                    | Privacy      |
| R-06 | Editor provenance anchors drift                    | M/High     | typed blocks/hash/offset diff, invalidate uncertain spans; indicator: mapping property tests                                          | Documents    |
| R-07 | ATS score misleads users                           | M/High     | deterministic categories, coverage, limitations, copy tests; indicator: user research/support reports                                 | Product      |
| R-08 | DOCX/PDF libraries fail accessibility/fidelity     | M/High     | pinned tagged/semantic renderers, parse-back, XML/Poppler/visual/manual checks, fixed-template limits; indicator: fixture pass rate   | Export       |
| R-09 | Deletion leaves orphan/backup resurrection         | L/Critical | idempotent verify, orphan scan, ≤30d backups, tombstone replay; indicator: deletion drills                                            | Platform     |
| R-10 | Self-host setup too complex                        | M/Medium   | one Compose stack, validation, clean-host tests; indicator: setup completion/time                                                     | Maintainers  |
| R-11 | Local models miss quality threshold                | H/Medium   | publish evals, manual workflow, no parity claims; indicator: per-model metrics                                                        | AI           |
| R-12 | Dependency/supply-chain exploit                    | M/High     | minimize/pin/audit/SBOM, rapid advisories; indicator: SCA alerts                                                                      | Maintainers  |
| R-13 | Background jobs duplicate charges/versions         | M/High     | idempotency, leases, atomic results; indicator: duplicate invariant tests                                                             | Platform     |
| R-14 | Scope exceeds volunteer capacity                   | H/High     | strict MVP/non-goals, milestone gates, modular delivery                                                                               | Product      |
| R-15 | AGPL reduces adoption/contribution                 | M/Medium   | clear rationale/compliance docs; review community feedback                                                                            | Maintainers  |
| R-16 | Recovery pair or tombstone replay is mis-operated  | M/Critical | encrypted paired backup script, nonempty-target refusal, replay-before-app restore drill; indicator: timed quarterly restore evidence | Platform     |
| R-17 | Automated accessibility checks mask an AT barrier  | M/High     | keyboard, zoom, forced-color, NVDA, VoiceOver, and export-AT manual matrix; indicator: signed release record                          | UX           |

Critical/high risks are reviewed at each release. Accepted exceptions record expiry and compensating control; none currently exist.

As of 2026-07-01, clean production Compose, parser cold-start/failure recovery, isolated SSRF fixtures, authenticated reference load, deletion replay, and paired encrypted restore evidence reduce R-03, R-04, R-09, R-10, and R-16. R-17 remains a publication blocker until the named manual assistive-technology matrix is signed off. Remote supply-chain workflow evidence for R-12 also remains maintainer-controlled; local audit, notices, secret/action pin, and production-image configuration checks pass.
