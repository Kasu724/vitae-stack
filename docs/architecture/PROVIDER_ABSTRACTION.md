# Provider abstraction

The domain calls `AIProvider.generate(taskRequest)` through capability-negotiated adapters. The normalized request includes task ID/version, model alias, messages/data parts, JSON Schema, temperature policy, token/time budget, and correlation ID. The response includes structured candidate text/value, finish/refusal status, usage, provider request ID (safe metadata), and capability warnings.

MVP adapters:

1. **OpenAI-compatible:** configurable HTTPS/loopback base URL, optional bearer credential, chat/responses capability profile, JSON Schema when supported, and an OpenAI preset. Unknown public endpoints require the same public-network validation class as URL fetches; private endpoints require operator allowlisting because local providers are expected.
2. **Ollama:** local endpoint preset and native/compatible structured-output path. Ollama documents JSON Schema support, including through its [OpenAI-compatible API](https://docs.ollama.com/capabilities/structured-outputs).

Provider capabilities needed by the MVP—structured schema, usage reporting, and normalized refusal support—are tested with a synthetic payload and cached without sending career data. Streaming, seed, and context-size discovery remain post-MVP unless a task requires them. Tasks declare required capabilities. A task fails clearly when requirements are absent; the adapter never silently downgrades grounding validation.

Credentials are write-only encrypted envelopes or restricted `AI_PROVIDER_` environment references. Adapters receive decrypted values only for the request and cannot log them. Public calls use HTTPS, all-address DNS validation, pinned resolution, response limits, and no redirects; private origins require an exact operator allowlist. The task runner applies local schema validation, at most two repair attempts, bounded transient retries, one deadline/token budget, and hard semantic validators that cannot be repaired. A process-local guard limits concurrency and starts and opens a short circuit after repeated failures. Database/task idempotency remains the responsibility of each owning workflow because generation requests have no side effects until a validated result is stored. See [model support](../ai/MODEL_PROVIDER_SUPPORT.md).
