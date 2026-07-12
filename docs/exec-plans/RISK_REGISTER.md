# Risk register

Likelihood/impact are qualitative for the MVP release candidate. Owners are project roles until maintainers assign names.

| ID   | Risk                                               | L/I        | Mitigation and indicator                                                                                                             | Owner        |
| ---- | -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| R-01 | Model inserts unsupported claim                    | M/Critical | closed schemas, claim coverage, evidence validator, export block; indicator: eval rejection/escape rate                              | AI + product |
| R-02 | Cross-workspace data exposure                      | L/Critical | scoped services/queries/keys, composite constraints, adversarial tests; indicator: authz test/denial anomaly                         | Security     |
| R-03 | Parser compromise/bomb                             | M/High     | quarantine, sandbox, hard limits, patching, malicious corpus; indicator: child resource/crash rate                                   | Platform     |
| R-04 | SSRF/rebinding reaches private service             | M/Critical | pin/revalidate/egress deny, no browser fetch; indicator: blocked-destination tests/events                                            | Security     |
| R-05 | Provider sends/retains sensitive data unexpectedly | M/High     | destination disclosure, minimal context, local option, no provider tools; indicator: config review                                   | Privacy      |
| R-06 | Editor provenance anchors drift                    | M/High     | typed blocks/hash/offset diff, invalidate uncertain spans; indicator: mapping property tests                                         | Documents    |
| R-07 | ATS score misleads users                           | M/High     | deterministic categories, coverage, limitations, copy tests; indicator: user research/support reports                                | Product      |
| R-08 | DOCX/PDF libraries fail fidelity                   | M/High     | pinned renderers, parse-back, XML/Poppler/visual checks, fixed-template limits; indicator: fixture pass rate                         | Export       |
| R-09 | Deletion leaves orphan/external-copy resurrection  | L/Critical | idempotent verification, orphan scan, startup tombstone reconciliation, and restore-ledger instructions; indicator: deletion drills  | Platform     |
| R-10 | Local setup is too complex                         | M/Medium   | one portable ZIP, bundled runtime, launcher validation, and clean-host tests; indicator: setup completion/time                       | Maintainers  |
| R-11 | Local models miss quality threshold                | H/Medium   | publish evals, manual workflow, no parity claims; indicator: per-model metrics                                                       | AI           |
| R-12 | Dependency/supply-chain exploit                    | M/High     | minimize/pin/audit/SBOM, rapid advisories; indicator: SCA alerts                                                                     | Maintainers  |
| R-13 | Background jobs duplicate charges/versions         | M/High     | idempotency, leases, atomic results; indicator: duplicate invariant tests                                                            | Platform     |
| R-14 | Scope exceeds volunteer capacity                   | H/High     | strict MVP/non-goals, milestone gates, modular delivery                                                                              | Product      |
| R-15 | Untrusted permissive forks confuse users           | M/Medium   | clear official-release guidance, checksums, provenance, security docs, and review of community feedback                              | Maintainers  |
| R-16 | Backup restore omits the deletion ledger           | M/Critical | coordinated stopped copy, newest-ledger carry-forward, nonempty-target refusal, and restore drill; indicator: timed restore evidence | Platform     |

Critical/high risks are reviewed at each release. Accepted exceptions record expiry and compensating control; none currently exist.

As of 2026-07-11, clean production portable-package, parser cold-start/failure recovery, isolated SSRF fixtures, loopback reference load, startup deletion replay, and coordinated-copy restore evidence reduce R-03, R-04, R-09, R-10, and R-16. Local dependency audit, notices, secret scanning, pinned CI actions, and production-package checks reduce R-12. Remote attestations remain maintainer-controlled optional publication evidence.

As of 2026-07-11, the personal launcher further reduces R-10 by removing account bootstrap and manual secret configuration. ACASE-12 covers accidental LAN exposure: launchers and package scripts bind the app to `127.0.0.1`, non-loopback and forwarded authorities fail closed, and interrupted parser/fetch children are recovered by the local queue lifecycle. A user who edits the launcher or starts Next with a wildcard hostname can still expose the sole workspace and is outside the supported boundary.
