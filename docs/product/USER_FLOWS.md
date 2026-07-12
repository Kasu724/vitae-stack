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

The user selects scope, receives a dependent-count and consequence preview, confirms an explicit phrase, and receives a content-free operation ID. New writes are blocked while managed SQLite rows and files are deleted. The application cannot delete backup or export copies the user placed outside its data folder.

See [UX specification](../design/UX_SPECIFICATION.md) and [data lifecycle](../architecture/DATA_LIFECYCLE.md).
