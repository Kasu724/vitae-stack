import { z } from "zod";

import type {
  AIProvider,
  ProviderHttpTransport,
  ProviderRequest,
  ProviderResponse,
} from "./contracts";
import { ProviderRequestError } from "./contracts";

const responseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export class OpenAiCompatibleAdapter implements AIProvider {
  public readonly kind = "openai_compatible" as const;

  public constructor(
    private readonly baseUrl: URL,
    private readonly credential: string | null,
    private readonly transport: ProviderHttpTransport,
  ) {}

  public async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const endpoint = new URL("chat/completions", this.baseUrl);
    const response = await this.transport.postJson({
      url: endpoint,
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
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: request.jsonSchema,
          },
        },
      },
    });
    if (response.status === 401 || response.status === 403)
      throw new ProviderRequestError("AUTHENTICATION");
    if (response.status === 429) throw new ProviderRequestError("RATE_LIMITED");
    if (response.status < 200 || response.status >= 300)
      throw new ProviderRequestError("UNAVAILABLE");
    const parsed = responseSchema.safeParse(response.body);
    if (!parsed.success) throw new ProviderRequestError("INVALID_RESPONSE");
    const choice = parsed.data.choices[0]!;
    const common = {
      model: parsed.data.model ?? request.model,
      ...(parsed.data.id ? { providerRequestId: parsed.data.id } : {}),
      ...(parsed.data.usage
        ? {
            usage: {
              ...(parsed.data.usage.prompt_tokens !== undefined
                ? { inputTokens: parsed.data.usage.prompt_tokens }
                : {}),
              ...(parsed.data.usage.completion_tokens !== undefined
                ? { outputTokens: parsed.data.usage.completion_tokens }
                : {}),
            },
          }
        : {}),
      warnings: [],
    };
    if (choice.message.refusal)
      return { status: "refused", refusal: choice.message.refusal, ...common };
    if (!choice.message.content)
      throw new ProviderRequestError("INVALID_RESPONSE");
    return {
      status: "completed",
      text: choice.message.content,
      ...(choice.finish_reason ? { finishReason: choice.finish_reason } : {}),
      ...common,
    };
  }
}
