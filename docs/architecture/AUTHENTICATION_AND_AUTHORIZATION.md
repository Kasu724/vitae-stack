# Local identity and authorization

The MVP has no accounts, passwords, sessions, registration, social login, or external identity provider. On first use, the application creates one opaque local user, one workspace, and one career profile in the local SQLite database. Every later request derives that same principal server-side; the browser cannot choose a user or workspace identifier.

This is safe only within the supported local boundary:

- server bind and public URL must be loopback;
- Host and forwarded-host checks reject non-loopback authorities;
- no remote/shared deployment mode exists; and
- launcher and startup validation fail closed instead of silently exposing the workspace.

Repositories still require a server-derived workspace principal and include workspace predicates and composite ownership constraints. This prevents accidental cross-object access and preserves domain invariants even though the release has one workspace. Object-not-found responses do not disclose whether an identifier exists elsewhere.

Sensitive confirmation is still required for destructive local operations. There is no “recent login” challenge; deletion uses an explicit phrase, dependency preview, and operation receipt. Provider credentials are write-only after creation and encrypted locally.

See [ADR-0021](../adr/0021-local-sqlite-no-account-runtime.md) and the [threat model](../security/THREAT_MODEL.md).
