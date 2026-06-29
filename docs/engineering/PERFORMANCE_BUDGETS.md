# Performance budgets

Reference hardware: 4 vCPU, 8 GiB RAM, local SSD, PostgreSQL and artifact volume on the same host; browser on a typical broadband/modern laptop. Measure with representative synthetic data: 1,000 facts, 100 documents × 20 versions, 50 jobs, and a two-page resume. AI network latency is reported separately.

| Operation                        | Budget                                                                 |
| -------------------------------- | ---------------------------------------------------------------------- |
| Authenticated HTML/API read      | p95 ≤500 ms server time                                                |
| Simple mutation/version metadata | p95 ≤750 ms                                                            |
| Editor typing/input response     | p95 INP ≤200 ms; no keystroke network dependency                       |
| CIB search/filter                | p95 ≤300 ms server time at reference size                              |
| Deterministic ATS analysis       | p95 ≤2 s for canonical two-page document/job                           |
| Queue pickup under idle load     | p95 ≤1 s                                                               |
| PDF/DOCX parse (10 MiB cap)      | ≤30 s wall timeout, ≤512 MiB worker child                              |
| URL retrieval                    | ≤10 s total, ≤5 MiB decompressed                                       |
| Export                           | p95 ≤10 s PDF/DOCX at two pages                                        |
| Portability archive              | progress required after 2 s; bounded by quota; no web-request blocking |

Initial JavaScript budget for non-editor routes is ≤200 KiB gzip first-party; editor route ≤350 KiB gzip, measured and revisited after implementation. Core Web Vitals target “good” thresholds at p75 for local reference measurements, but privacy prevents mandatory remote analytics.

Load tests verify rate limits, queue fairness, memory recovery after hostile parser jobs, no unbounded result sets, and graceful provider/database/storage failure. A budget regression blocks release unless a dated exception includes measurement, user impact, and mitigation.
