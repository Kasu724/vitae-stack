# Model provider support

## MVP matrix

| Path              | Authentication                                   | Endpoint                                            | Structured output                                                        | Notes                                                       |
| ----------------- | ------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| OpenAI-compatible | Optional bearer/API key                          | Public HTTPS or explicitly allowed loopback/private | Native JSON Schema when advertised; JSON plus local validation otherwise | Includes OpenAI preset; endpoint/model chosen by user       |
| Ollama            | Usually none on loopback; operator policy on LAN | Loopback/default or explicit allowlist              | Native `format`/OpenAI-compatible schema where model supports it         | No bundled model; quality varies and is evaluated per model |

For the OpenAI API endpoint, the adapter uses `max_completion_tokens`, which is the current Chat Completions output limit parameter for reasoning-capable models. It omits the legacy sampling-temperature field for GPT-5 models. Other OpenAI-compatible endpoints retain `max_tokens` and the configured temperature for broad compatibility.

Providers are not endorsed and no model is guaranteed to pass all tasks. Capability tests use synthetic content and show the exact configured endpoint, endpoint policy status, structured-output result, normalized refusal support, and whether usage metadata was observed. The synthetic test uses the bounded 30-second deadline used by most MVP AI tasks so reasoning-capable models are not rejected by a shorter preflight. AI-01 uses a bounded 90-second task budget for its initial response and at most two shared-budget repair attempts, with a 16,384-token output ceiling for the proposal hierarchy. Capability tests are not application-rate-limited; a rate-limit result therefore indicates the provider declined the request. When a test fails, the settings UI shows a safe category (credential rejection, invalid request, rate limit, timeout, invalid structured response, unavailable endpoint/model, refusal, or unknown) without exposing provider response text. Tests do not transmit career data. Context-size discovery is not part of the MVP capability test.

Per-task configuration allows a provider/model alias, but required task semantics are constant. One assignment action may apply the same model to one, multiple selected, or all registered tasks atomically. The application pins model identifiers when a provider supports snapshots and records the actual returned model. It shows estimated tokens/cost only when provider metadata is available and labels estimates.

Remote credentials are encrypted server-side or referenced from environment variables; local endpoints can omit a key. The browser receives only masked labels. Provider-specific SDKs and response types stay inside adapters. Adding a provider requires contract, schema, timeout/refusal, redaction, capability, and eval tests plus a data-handling disclosure.

Future adapters may include Anthropic, Gemini, or local runtimes, but none are MVP dependencies. Provider-hosted file search, assistants, vector stores, web search, or training are not used; Vitae Stack sends minimal text directly for the selected task.
