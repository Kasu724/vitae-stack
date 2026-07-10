# Threat Model

The main risks are exposure of private career data, unsafe file handling, untrusted network destinations, credential leakage, and misleading generated content.

## Primary Mitigations

- Keep the supported personal package local and loopback-bound.
- Treat uploads, URLs, templates, rendered output, and imported archives as untrusted.
- Validate file type, size, expansion limits, parser output, and export content.
- Never log document content, credentials, provider requests, or model output.
- Require generated factual career claims to remain tied to user-approved evidence.
- Make deletion, export, backup, and restore explicit user-controlled workflows.
