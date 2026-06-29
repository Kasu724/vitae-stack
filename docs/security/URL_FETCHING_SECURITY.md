# URL fetching security

Job URL retrieval is a dedicated worker capability, not general HTTP access. OWASP notes redirects and DNS rebinding as central SSRF hazards; the design follows safe-by-construction validation ([OWASP SSRF guidance](https://owasp.org/www-community/pages/controls/SSRF_Prevention_in_Nodejs.html)).

## Required algorithm

1. Parse with the platform URL parser; reject credentials, fragments for fetch, malformed/ambiguous hosts, non-HTTPS schemes, nondefault ports, and IP literals by default.
2. Normalize IDN/hostname; apply domain/port deny and optional operator allowlists.
3. Resolve A and AAAA through controlled DNS. Reject if any result is loopback, private, link-local, carrier-grade NAT, multicast, unspecified, documentation/test, benchmark, reserved, metadata-service, or otherwise non-global.
4. Pin the validated IP for the connection while preserving TLS SNI/hostname verification; prevent proxy/environment-variable bypass.
5. On each redirect, repeat all steps. Allow at most 3; reject scheme downgrade and credentials.
6. Send GET only, no cookies/auth/referer/client certificates, generic bounded user agent, and restrictive `Accept`.
7. Enforce 3s connect/10s total timeout, 5 MiB decompressed body, compression ratio, header count/size, and content-type allowlist (`text/html`, `text/plain`, PDF/DOCX where routed to file pipeline).

The fetcher never executes JavaScript, loads subresources, submits forms, follows meta refresh, or uses a logged-in browser. HTML sanitization removes active/remote content. Requests are rate- and concurrency-limited per user and deployment; egress firewall rules are recommended as defense in depth.

Provider endpoint configuration uses a related policy: public endpoints must pass global-address checks; loopback/private AI endpoints require explicit operator allowlisting and are never derived from job content. Tests simulate rebinding, mixed safe/unsafe DNS answers, IPv4 variants, IPv6 mapped addresses, redirect chains, large compressed bodies, slowloris, proxy variables, and metadata targets.
