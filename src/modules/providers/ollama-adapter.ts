import { z } from "zod";

import type {
  AIProvider,
  ProviderHttpTransport,
  ProviderRequest,
  ProviderResponse,
} from "./contracts";
import { ProviderRequestError } from "./contracts";

const responseSchema = z.object({
  model: z.string().optional(),
  message: z.object({ content: z.string() }),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
});

export class OllamaAdapter implements AIProvider {
  public readonly kind = "ollama" as const;

  public constructor(
    private readonly baseUrl: URL,
    private readonly credential: string | null,
    private readonly transport: ProviderHttpTransport,
  ) {}

  public async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const response = await this.transport.postJson({
      url: new URL("api/chat", this.baseUrl),
      timeoutMs: request.timeoutMs,
      headers: {
        "content-type": "application/json",
        ...(this.credential
          ? { authorization: `Bearer ${this.credential}` }
          : {}),
      },
      body: {
        model: request.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        stream: false,
        format: request.jsonSchema,
        options: {
          temperature: request.temperature,
          num_predict: request.maxOutputTokens,
        },
      },
    });
    if (response.status === 401 || response.status === 403)
      throw new ProviderRequestError("AUTHENTICATION");
    if (response.status === 400)
      throw new ProviderRequestError("INVALID_REQUEST");
    if (response.status === 429) throw new ProviderRequestError("RATE_LIMITED");
    if (response.status < 200 || response.status >= 300)
      throw new ProviderRequestError("UNAVAILABLE");
    const parsed = responseSchema.safeParse(response.body);
    if (!parsed.success || !parsed.data.message.content)
      throw new ProviderRequestError("INVALID_RESPONSE");
    return {
      status: "completed",
      text: parsed.data.message.content,
      model: parsed.data.model ?? request.model,
      ...(parsed.data.done_reason
        ? { finishReason: parsed.data.done_reason }
        : {}),
      ...(parsed.data.prompt_eval_count !== undefined ||
      parsed.data.eval_count !== undefined
        ? {
            usage: {
              ...(parsed.data.prompt_eval_count !== undefined
                ? { inputTokens: parsed.data.prompt_eval_count }
                : {}),
              ...(parsed.data.eval_count !== undefined
                ? { outputTokens: parsed.data.eval_count }
                : {}),
            },
          }
        : {}),
      warnings: ["Ollama does not provide a normalized refusal field."],
    };
  }
}
