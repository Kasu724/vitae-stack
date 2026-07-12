# ADR-0011: Use a typed block editor with immutable versions

- **Status:** Accepted
- **Date:** 2026-06-28

## Context

Editing must preserve structure, suggestions, claim anchors, locks, and export determinism. Arbitrary HTML or DOCX-as-source makes these invariants fragile.

## Decision

Persist versioned canonical JSON with restricted block/node types and stable IDs. Use native labeled controls for the MVP editor; M15 completes production editing and provenance-aware review. Keep the editor behind domain operations. Drafts use optimistic concurrency; explicit saves/suggestion batches/restores create full immutable snapshots. HTML/DOCX/PDF are render targets only.

## Alternatives considered

Rich HTML contenteditable is flexible but unsafe/inconsistent. Markdown is portable but weak for layout/claim spans. DOCX as canonical requires complex round trips. Operational-transform/CRDT collaboration is unnecessary for one-owner MVP.

## Consequences

Rendering, diffs, provenance, and migrations are controlled. Building editing and paste behavior is substantial. Arbitrary imported layout cannot be preserved exactly.

## Security and privacy implications

Restricted nodes and escaping reduce XSS/export injection. Plugins are minimized and cannot fetch data. Version conflicts never silently overwrite sensitive content.

## Revisit conditions

Collaborative editing enters scope, or document-schema limitations block common resume structures.

## Implementation note (2026-06-29)

M05 uses native semantic controls over the repository-owned schema. [Lexical's official documentation](https://lexical.dev/) and current 0.46.0 package metadata were reviewed; Lexical is the preferred M15 headless layer but is intentionally not installed until the richer interaction is implemented and tested. Lexical JSON will be an adapter format, never the persisted canonical contract.
