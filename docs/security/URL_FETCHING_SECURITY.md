# URL fetching security

Job URL ingestion accepts public HTTPS URLs only. It rejects credentials, fragments, nonstandard ports, IP literals, local/single-label hostnames, and private, loopback, link-local, multicast, reserved, documentation, benchmarking, carrier-grade NAT, and mapped-address ranges.

For each request and redirect, the fetcher resolves all addresses, requires every answer to be public, and pins one validated address into the TLS connection while preserving hostname/SNI verification. It ignores proxy environment variables, sends no cookies, authorization, referer, or user agent secrets, and follows at most three redirects. Redirect targets repeat the complete validation; DNS rebinding or a mixed public/private answer fails closed.

Connection and total deadlines, header/compressed/decompressed byte caps, compression-ratio limits, charset checks, and an allowlist of HTML/plain-text types bound resource use. The fetcher never executes JavaScript, loads subresources, submits forms, follows meta refresh, or uses a logged-in browser. HTML is converted to inert normalized text.

The local service runs bounded in-process retrieval, persists idempotent workspace-owned operation state in SQLite, and limits attempts per local workspace. Failures expose paste/file fallback without echoing sensitive URL components. Tests cover rebinding, redirects, IPv4/IPv6 variants, metadata targets, proxy variables, slow responses, oversized/compressed bodies, and content-type/encoding confusion.
