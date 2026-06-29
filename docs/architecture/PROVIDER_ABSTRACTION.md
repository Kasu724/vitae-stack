# Provider abstraction

The domain calls `AIProvider.generate(taskRequest)` through capability-negotiated adapters. The normalized request includes task ID/version, model alias, messages/data parts, JSON Schema, temperature policy, token/time budget, and correlation ID. The response includes structured candidate text/value, finish/refusal status, usage, provider request ID (safe metadata), and capability warnings.

MVP adapters:

1. **OpenAI-compatible:** configurable HTTPS/loopback base URL, optional bearer credential, chat/responses capability profile, JSON Schema when supported, and an OpenAI preset. Unknown public endpoints require the same public-network validation class as URL fetches; private endpoints require operator allowlisting because local providers are expected.
2. **Ollama:** local endpoint preset and native/compatible structured-output path. Ollama documents JSON Schema support, including through its [OpenAI-compatible API](https://docs.ollama.com/capabilities/structured-outputs).

Provider capabilities—structured schema, streaming, token count, seed, refusal, context size—are discovered/configured and cached without sending career data. Tasks declare required and optional capabilities. A task fails clearly when requirements are absent; the adapter never silently downgrades grounding validation.

Credentials are write-only encrypted envelopes or environment references. Adapters receive decrypted bytes only for the request and cannot log them. Endpoints, provider/model labels, data classes, and retention-policy link are displayed before use. Circuit breakers, bounded retries with jitter, deadlines, concurrency/rate limits, and idempotency prevent cascading cost or load. See [model support](../ai/MODEL_PROVIDER_SUPPORT.md).
