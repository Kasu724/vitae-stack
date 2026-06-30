# ADR-0017: Isolate and harden job URL fetching

- **Status:** Accepted
- **Date:** 2026-06-28

## Context

Fetching user-supplied job URLs creates SSRF, rebinding, redirect, decompression, tracking, and parser risks. A headless browser would expand them.

## Decision

Use a dedicated worker fetcher: HTTPS/default ports, canonical URL, no credentials/IP literals, resolve and reject any non-global address, pin connection with TLS hostname validation, repeat every redirect (max three), no cookies/auth/proxy inheritance/subresources/JavaScript, and strict header/body/time/content limits. Route PDF/DOCX through the file pipeline. Provide paste/upload fallback.

## Alternatives considered

Client-side fetch is blocked by CORS and leaks user browsing context. General server `fetch` with a hostname blacklist misses DNS/IP variants. Headless browser handles dynamic sites but has substantially larger attack/resource surface. Domain allowlisting cannot cover job sites.

## Consequences

Many public static descriptions work; bot-protected/dynamic/login pages do not. DNS pinning and cross-platform networking need focused implementation/tests. Operators can disable URL fetching entirely.

## Security and privacy implications

Protects internal services/metadata and avoids sending user credentials/referer. Logs omit paths/query and resolved addresses. Egress firewall is recommended defense in depth.

## Revisit conditions

Safe library/runtime primitives change, dynamic-site demand justifies a separately sandboxed opt-in browser fetcher, or new SSRF research invalidates assumptions.

## Implementation note (M09 in progress)

The current fetch primitive uses the Node 24 HTTPS request/DNS APIs, rejects documented special-use address classes, validates every returned address, and supplies only a validated pinned address through the request lookup callback while preserving TLS hostname verification. HTML extraction pins `htmlparser2` 12.0.0. The authenticated workflow uses durable workspace-owned operation/import rows and a private queue shared with a no-credential, resource-limited sidecar outside the application backend network. Production configuration requires this sidecar or disables URL fetching. Focused policy tests pass locally; isolated network-fixture and live Compose validation remain pending, so M09 is not yet complete.
