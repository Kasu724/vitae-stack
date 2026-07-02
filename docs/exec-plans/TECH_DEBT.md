# Technical debt register

The modular monolith and M01–M20 product paths are implemented and locally validated. The items below remain deliberate post-MVP follow-ups, not permission to weaken release gates. External manual assistive-technology evidence and remote release-workflow results remain blockers in the active plan rather than accepted debt.

| ID    | Deferred item                      | Why deferred                                                                              | Trigger / intended phase                        |
| ----- | ---------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------- |
| TD-01 | PostgreSQL RLS defense in depth    | Application scoping plus tests is simpler initially                                       | Reassess after M02 and before shared workspaces |
| TD-02 | External OIDC/passkeys             | Closed self-hosted accounts avoid identity-provider complexity                            | Post-MVP operator demand                        |
| TD-03 | OCR/image-only documents           | Large parser/privacy/accessibility surface                                                | Post-MVP sandbox/eval proposal                  |
| TD-04 | Semantic embedding retrieval       | Lexical/structured retrieval is adequate baseline; vector stack adds model/data lifecycle | When evals show missed evidence                 |
| TD-05 | Declarative custom templates       | Template injection and accessibility need a safe language                                 | After fixed templates pass M17                  |
| TD-06 | Multilingual ATS rules             | Requires locale-specific fixtures/research                                                | Separate ruleset milestone                      |
| TD-07 | Multi-node/HA reference            | One-host Compose fulfills MVP                                                             | Measured operator demand                        |
| TD-08 | Selective encrypted-backup erasure | Most simple backup formats require expiry rather than mutation                            | If operator tooling safely supports it          |

Each item needs an issue/ADR before work. Debt cannot bypass unsupported-claim, tenant-isolation, deletion, SSRF, or accessibility release gates.
