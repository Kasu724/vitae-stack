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

Create the exact reference-size dataset with `pnpm db:seed:performance -- --confirm-synthetic-scale --email <synthetic-owner>` on an isolated non-production deployment. The command is idempotent for that workspace and creates only labeled fictional records. Run authenticated HTML load with an access-restricted cookie-header file; the command never prints the cookie:

```sh
LOAD_BASE_URL=http://127.0.0.1:3000 \
LOAD_AUTH_COOKIE_FILE=/run/secrets/vitae-load-cookie \
pnpm test:load
```

Set `LOAD_PATH=/career` or another authenticated read path to exercise a specific bounded collection; the default is `/dashboard`.

The load harness issues 200 authenticated reads at concurrency 20, rejects redirects/failures, applies a two-second request timeout, and enforces p95 at 500 ms. On 2026-07-01, the reference dataset produced p95 results of 473 ms for dashboard, 344 ms for Career Bank, and 409 ms for document library with zero failures. These are end-to-end HTTP timings; they satisfy the general 500 ms read gate but do not isolate Career Bank server time, so the narrower 300 ms server-time budget must not be inferred from the 344 ms observation.

`pnpm test:performance` runs 50 deterministic ATS analyses and three PDF plus three DOCX render/parse-back operations over a synthetic two-page, 36-claim document. The same run measured ATS p95 6 ms, PDF p95 936 ms, and DOCX p95 66 ms. Cold parser execution, bounded failure classification, worker restart, and the 512 MiB child ceiling were validated in the production Compose topology. Browser automation covers responsive input and editor behavior; release maintainers should retain INP and JavaScript-size measurements as trend data when producing published artifacts.
