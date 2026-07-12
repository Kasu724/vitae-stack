# Technical debt register

These are possible post-MVP improvements, not permission to weaken release gates or expand the local-only MVP.

| ID    | Deferred item                                               | Why deferred                                                               | Trigger                                           |
| ----- | ----------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| TD-01 | OCR/image-only documents                                    | large parser/privacy/resource surface                                      | separate sandbox and evaluation proposal          |
| TD-02 | Semantic embedding retrieval                                | lexical/structured retrieval is adequate; vectors add model/data lifecycle | evaluations show material missed evidence         |
| TD-03 | Declarative custom templates                                | template injection and renderer complexity                                 | safe-language ADR after fixed templates mature    |
| TD-04 | Additional locale-specific ATS rules                        | requires researched locale fixtures                                        | separate versioned ruleset milestone              |
| TD-05 | Faster/smaller portable packaging                           | current standalone ZIP is correct but large/slow to compress               | measured download/install friction                |
| TD-06 | Migration away from PostgreSQL-compatibility SQL transforms | adapter eases the pre-release SQLite transition                            | touch queries incrementally with repository tests |

Remote accounts, shared hosting, HA, cloud storage, and external identity are non-goals rather than debt. Each debt item needs an issue/ADR before work. None may bypass grounding, unsupported-claim, deletion, upload, SSRF, or secret controls.
