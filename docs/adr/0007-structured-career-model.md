# ADR-0007: Model structured career entries and immutable evidence facts

- **Status:** Accepted
- **Date:** 2026-06-28

## Context

Documents alone cannot reliably distinguish approved facts, corrections, metrics, conflicts, or reusable evidence. Overly rigid tables cannot cover diverse career histories.

## Decision

Use typed `CareerEntry` aggregates for common categories, normalized `Skill` relations, flexible validated attributes, and immutable `EvidenceFact` assertions. Extraction/manual input creates proposals; explicit approval creates facts. Corrections create `supersedes` facts; withdrawal excludes future use; hard deletion previews dependents.

## Alternatives considered

Store only resume blobs/text loses evidence lifecycle. Fully normalized subtype tables add many sparse migrations. Schemaless JSON weakens constraints/search. Mutating approved rows destroys historical provenance.

## Consequences

Facts are reusable, searchable, and auditable across documents. The system must maintain schemas, proposal review, duplicate/conflict detection, and migration of flexible attributes. Entries organize facts but do not become evidence implicitly.

## Security and privacy implications

Every fact and relation is workspace-owned; approval actor/time and source locator are sensitive. Search/indexing remains local and scoped. Hard deletion removes dependent support rather than leaving dangling claims.

## Revisit conditions

Real user research reveals missing canonical fact types, JSON attributes cannot be queried/migrated safely, or shared/organization workspaces require richer ownership.
