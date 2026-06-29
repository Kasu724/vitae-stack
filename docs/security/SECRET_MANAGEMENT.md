# Secret management

Secrets include session/auth keys, database passwords, credential-encryption key, provider API keys, S3 credentials, SMTP credentials, and release signing material. They never enter Git, images, browser storage, URLs, logs/traces/metrics, prompts, exports, fixtures, screenshots, support bundles, or error details.

Deployment secrets come from environment/file-mounted container secrets or an operator secret manager. `.env` is development-only and ignored. `AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` are independently generated with at least 256 bits. Database runtime and migration credentials are separate; production must not use a superuser.

Per-user provider keys are stored as versioned AES-256-GCM envelopes: random nonce, ciphertext, key version, and authenticated context binding user/config/provider. The master key is external. Keys are write-only through the API; UI receives last-four/fingerprint metadata only. Decrypt immediately before request, retain only in memory, and overwrite/drop references promptly. An environment-referenced provider configuration stores only the variable name.

Rotation creates a new envelope/key version, verifies decryptability, atomically swaps, and schedules old-envelope deletion. Losing the master key makes encrypted credentials unrecoverable; backups must include key custody separately. Revocation errors remain generic. Startup validates placeholder/weak/missing secrets and unsafe reuse where detectable.

CI uses least-privilege ephemeral credentials and pinned GitHub environments; forks receive no secrets. Secret scanning runs on commits/history/release artifacts. Any exposure triggers revoke/rotate, log/artifact purge, impact review, and private security process—never merely deleting the Git line.
