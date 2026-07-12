# ADR-0008: Put AI providers behind task-neutral adapters

- **Status:** Accepted
- **Date:** 2026-06-28

## Context

Users need BYOK, local models, and freedom from provider lock-in. Providers differ in endpoints, schemas, refusals, usage, and capabilities; domain rules must remain consistent.

## Decision

Define narrow versioned task contracts and one normalized provider interface with capability negotiation. Ship OpenAI-compatible (including OpenAI preset) and Ollama adapters. Derive JSON Schema, validate locally with Zod, and record provider/model/task metadata. Provider SDK types remain inside adapters.

## Alternatives considered

One proprietary SDK is simpler initially but creates lock-in. A lowest-common-denominator text interface loses reliable capability handling. Supporting many providers in MVP multiplies tests. Embedding model logic in route handlers makes safety inconsistent.

## Consequences

Users can switch endpoint/model without changing facts/documents. Adapters need substantial contract/fault/eval tests. Some models will be unsupported for tasks and must fail clearly; no silent fallback.

## Security and privacy implications

Credentials stay server-side encrypted; context is minimized/disclosed; endpoints are validated. Model output is untrusted and cannot weaken provenance, locks, authorization, or scoring.

## Revisit conditions

Provider protocols materially diverge, streaming/tool capabilities become essential, or an adapter cannot meet evaluation thresholds without task-specific semantics.
