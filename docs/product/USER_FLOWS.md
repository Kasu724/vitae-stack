# User flows

## First value: import to approved evidence

```mermaid
flowchart LR
  A[Start Vitae Stack] --> C[Auto-provision local workspace]
  C --> E[Upload or enter career data]
  E --> F[Quarantine and parse]
  F --> G[Review extraction proposals]
  G -->|approve/edit| H[Immutable evidence facts]
  G -->|reject| I[Excluded proposal]
  H --> J[Career Information Bank]
```

The UI never labels parsed proposals as verified. Editing before approval changes the proposal; changing an approved fact creates a superseding fact.

## Tailoring

```mermaid
flowchart TD
  J[Add job: text, URL, or file] --> K[Review normalized job and requirements]
  K --> L[Requirement-evidence matrix]
  L --> M[Select source version, facts, locks, preferences]
  M --> N[Generate schema-validated suggestions]
  N --> O{Grounding checks pass?}
  O -->|no| P[Block or mark gap; never insert]
  O -->|yes| Q[Review atomic suggestions]
  Q --> R[Accept or reject]
  R --> S[New immutable document version]
  S --> T[Manual edit with claim-status recalculation]
  T --> U[Estimated ATS report]
  U --> V{All factual claims supported?}
  V -->|no| W[Resolve evidence or export labeled draft where allowed]
  V -->|yes| X[Final export and optional save to library]
```

## Data deletion

For career entries, generated documents, and jobs, the user selects one or more named cards, receives a per-record dependency and blocker preview, and confirms the complete named selection. The server rechecks ownership and blockers in one transaction: an entry supporting saved document claims, a document with an unexpected cross-document history reference, or a job supporting an accepted document version blocks the entire selection. Otherwise the eligible aggregate and derived graph are deleted together; document deletion also stages and erases managed export bytes. Job-source uploads remain separately managed. Full local-data deletion uses the stronger explicit phrase and content-free operation receipt, blocks new writes, and removes managed SQLite rows and files. The application cannot delete backup or downloaded export copies the user placed outside its data folder.

See [UX specification](../design/UX_SPECIFICATION.md) and [data lifecycle](../architecture/DATA_LIFECYCLE.md).
