# Model provider support

## MVP matrix

| Path              | Authentication                                   | Endpoint                                            | Structured output                                                        | Notes                                                       |
| ----------------- | ------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| OpenAI-compatible | Optional bearer/API key                          | Public HTTPS or explicitly allowed loopback/private | Native JSON Schema when advertised; JSON plus local validation otherwise | Includes OpenAI preset; endpoint/model chosen by user       |
| Ollama            | Usually none on loopback; operator policy on LAN | Loopback/default or explicit allowlist              | Native `format`/OpenAI-compatible schema where model supports it         | No bundled model; quality varies and is evaluated per model |

Providers are not endorsed and no model is guaranteed to pass all tasks. Capability tests use synthetic content and show endpoint host, TLS/private-network classification, schema support, refusal behavior, context limit if known, and measured result. Tests do not transmit career data.

Per-task configuration allows a provider/model alias, but required task semantics are constant. The application pins model identifiers when a provider supports snapshots and records the actual returned model. It shows estimated tokens/cost only when provider metadata is available and labels estimates.

Remote credentials are encrypted server-side or referenced from environment variables; local endpoints can omit a key. The browser receives only masked labels. Provider-specific SDKs and response types stay inside adapters. Adding a provider requires contract, schema, timeout/refusal, redaction, capability, and eval tests plus a data-handling disclosure.

Future adapters may include Anthropic, Gemini, or local runtimes, but none are MVP dependencies. Provider-hosted file search, assistants, vector stores, web search, or training are not used; Vitae Stack sends minimal text directly for the selected task.
