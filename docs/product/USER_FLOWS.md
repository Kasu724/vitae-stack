# User flows

## First value: import to approved evidence

```mermaid
flowchart LR
  A[Onboarding] --> B[Choose password or valid trusted-local mode]
  B --> C[Create profile]
  C --> D[Upload or enter career data]
  D --> E[Quarantine and parse]
  E --> F[Review extraction proposals]
  F -->|approve/edit| G[Immutable evidence facts]
  F -->|reject| H[Excluded proposal]
  G --> I[Career Information Bank]
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

The user selects scope, receives dependent-count and consequence preview, reauthenticates in password mode, confirms an explicit phrase, and receives a content-free operation ID. New writes are blocked for a workspace being deleted. Active database rows and artifacts are removed within 24 hours; backup expiry is reported as no later than 30 days.

See [UX specification](../design/UX_SPECIFICATION.md) and [data lifecycle](../architecture/DATA_LIFECYCLE.md).
