# Authentication and authorization

## Current implementation

M03 implements Better Auth 1.6.22 with the Drizzle adapter, UUID IDs, database sessions and rate-limit counters, closed sign-up, an explicit same-origin guard on unsafe auth requests, generic credential errors, and server-resolved owner workspace principals. Production HTTPS uses `Secure`, HttpOnly, SameSite=Lax cookies; local HTTP omits only `Secure`. Browser and integration tests cover sign-in/out, session uniqueness/revocation, CSRF, brute-force limits, enumeration resistance, operator bootstrap/reset, trusted-local guards/claim, and cross-workspace denial.

## Modes

**Password mode (reference):** Better Auth email/password, closed registration, operator-created first account through a one-time hidden-input or mounted-secret bootstrap command, database sessions, secure HttpOnly SameSite=Lax cookies, session rotation, CSRF origin/token checks, login/reset rate limits, generic errors, and optional email verification when SMTP is configured. Persistent startup environment variables must not contain a bootstrap password. Password hashing uses Better Auth's maintained scrypt default with M03 benchmarking to confirm resource parameters on reference hardware. Configuration uses Better Auth's documented `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` names. Official capabilities were verified against [Better Auth email/password documentation](https://better-auth.com/docs/authentication/email-password).

**Trusted-local mode:** no login UX; creates/uses one user and one workspace. Startup rejects non-loopback bind, unsafe trusted-proxy settings, registration/multi-user configuration, or production mode without an explicit danger acknowledgement. Reverse proxy exposure is unsupported. Switching to password mode requires an account-claim migration and backup.

## Operator procedures

Apply migrations first. In password mode, bootstrap exactly one account:

```text
pnpm auth:bootstrap -- --email owner@example.test --name "Owner"
```

The command refuses a non-empty user table. It reads the password through a non-echoing TTY; automation sets `AUTH_BOOTSTRAP_PASSWORD_FILE` to a mounted, access-restricted file for that process only. Never put the password in arguments or persistent environment configuration.

If SMTP reset is not configured, stop the app and run `pnpm auth:reset-password -- --email <address>` with hidden input or a one-process `AUTH_RESET_PASSWORD_FILE`. The command rehashes the password, revokes every session for the account, and records a content-free audit event.

To convert trusted-local data, stop the app, verify a backup, keep the safe trusted-local environment active, set `AUTH_CLAIM_PASSWORD_FILE` to a mounted secret, and run:

```text
pnpm auth:claim-trusted-local -- --email owner@example.test --name "Owner"
```

The claim adds credentials to the existing user and preserves the workspace ID. After it succeeds, replace the auth secret if needed and restart with `AUTH_MODE=password`. The command refuses to run outside trusted-local mode.

Better Auth 1.6.22 uses scrypt through Node crypto with `N=16384`, `r=16`, `p=1`, and a 64-byte derived key. `pnpm auth:benchmark` runs five synthetic hashes. The pinned Node 24.17.0 container measured 66–134 ms (median 68 ms) on the 2026-06-29 development host; release hardware must recheck latency and memory without reducing the maintained parameters.

## Authorization

MVP supports one owner membership per workspace and one workspace per user, while retaining a membership table for clean extension. Every application-service method receives an authenticated principal and workspace scope. Repositories include workspace predicates; artifact keys, job status, exports, provider configurations, and search indexes follow the same policy. Never authorize from client-supplied workspace alone.

Sensitive operations—credential changes, full export, workspace deletion, password change—require recent reauthentication. Session revocation follows password reset/change. Cookies are never accepted cross-origin; CORS is disabled by default. Rate limits use hashed account/IP buckets with bounded retention and do not log raw credentials.

PostgreSQL RLS is deferred defense-in-depth per the M02 resolution of OQ-03; application authorization, composite ownership constraints, and adversarial cross-tenant tests are mandatory. Database migration credentials are separate from runtime credentials. See [threat model](../security/THREAT_MODEL.md).
