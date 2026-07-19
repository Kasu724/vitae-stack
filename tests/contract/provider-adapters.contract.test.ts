import { describe, expect, it } from "vitest";

import type {
  ProviderHttpTransport,
  ProviderRequest,
} from "../../src/modules/providers/contracts";
import { ProviderRequestError } from "../../src/modules/providers/contracts";
import { OllamaAdapter } from "../../src/modules/providers/ollama-adapter";
import { OpenAiCompatibleAdapter } from "../../src/modules/providers/openai-compatible-adapter";

const request: ProviderRequest = {
  taskId: "AI-02",
  taskVersion: "ai-02.v1",
  model: "synthetic-model",
  system: "System instructions",
  user: "Synthetic job text",
  schemaName: "job_requirements",
  jsonSchema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
  temperature: 0,
  maxOutputTokens: 500,
  timeoutMs: 5_000,
  correlationId: "test-attempt-1",
};

class RecordingTransport implements ProviderHttpTransport {
  public input: Parameters<ProviderHttpTransport["postJson"]>[0] | undefined;

  public constructor(
    private readonly response: Awaited<
      ReturnType<ProviderHttpTransport["postJson"]>
    >,
  ) {}

  public postJson(input: Parameters<ProviderHttpTransport["postJson"]>[0]) {
    this.input = input;
    return Promise.resolve(this.response);
  }
}

describe("provider adapter contract", () => {
  it("sends strict JSON Schema to an OpenAI-compatible endpoint", async () => {
    const transport = new RecordingTransport({
      status: 200,
      headers: {},
      body: {
        id: "safe-request-id",
        model: "synthetic-model-1",
        choices: [
          {
            finish_reason: "stop",
            message: { content: '{"value":"ok"}' },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    });
    const adapter = new OpenAiCompatibleAdapter(
      new URL("https://models.example/v1/"),
      "test-secret",
      transport,
    );

    const result = await adapter.generate(request);

    expect(transport.input?.url.href).toBe(
      "https://models.example/v1/chat/completions",
    );
    expect(transport.input?.headers.authorization).toBe("Bearer test-secret");
    expect(transport.input?.body).toMatchObject({
      max_tokens: request.maxOutputTokens,
      response_format: {
        type: "json_schema",
        json_schema: { strict: true, schema: request.jsonSchema },
      },
    });
    expect(result).toMatchObject({
      status: "completed",
      text: '{"value":"ok"}',
      providerRequestId: "safe-request-id",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it("uses OpenAI's completion-token parameter for its current models", async () => {
    const transport = new RecordingTransport({
      status: 200,
      headers: {},
      body: { choices: [{ message: { content: '{"value":"ok"}' } }] },
    });
    const adapter = new OpenAiCompatibleAdapter(
      new URL("https://api.openai.com/v1/"),
      "test-secret",
      transport,
    );

    await adapter.generate({ ...request, model: "gpt-5.6" });

    expect(transport.input?.body).toMatchObject({
      max_completion_tokens: request.maxOutputTokens,
    });
    expect(transport.input?.body).not.toHaveProperty("max_tokens");
    expect(transport.input?.body).not.toHaveProperty("temperature");
  });

  it("normalizes OpenAI-compatible refusals and authentication errors", async () => {
    const refusalTransport = new RecordingTransport({
      status: 200,
      headers: {},
      body: {
        choices: [{ message: { refusal: "Cannot comply" } }],
      },
    });
    const adapter = new OpenAiCompatibleAdapter(
      new URL("https://models.example/v1/"),
      null,
      refusalTransport,
    );
    await expect(adapter.generate(request)).resolves.toMatchObject({
      status: "refused",
      refusal: "Cannot comply",
    });

    const authAdapter = new OpenAiCompatibleAdapter(
      new URL("https://models.example/v1/"),
      null,
      new RecordingTransport({ status: 401, headers: {}, body: {} }),
    );
    await expect(authAdapter.generate(request)).rejects.toMatchObject({
      code: "AUTHENTICATION",
    } satisfies Partial<ProviderRequestError>);
  });

  it("sends native JSON Schema to Ollama and normalizes usage", async () => {
    const transport = new RecordingTransport({
      status: 200,
      headers: {},
      body: {
        model: "qwen-synthetic",
        message: { content: '{"value":"ok"}' },
        done_reason: "stop",
        prompt_eval_count: 12,
        eval_count: 7,
      },
    });
    const adapter = new OllamaAdapter(
      new URL("http://ollama:11434/"),
      null,
      transport,
    );

    const result = await adapter.generate(request);

    expect(transport.input?.url.href).toBe("http://ollama:11434/api/chat");
    expect(transport.input?.body).toMatchObject({
      stream: false,
      format: request.jsonSchema,
      options: { temperature: 0, num_predict: 500 },
    });
    expect(result).toMatchObject({
      status: "completed",
      usage: { inputTokens: 12, outputTokens: 7 },
    });
  });

  it.each([400, 429, 500])("normalizes upstream HTTP %s", async (status) => {
    const adapter = new OllamaAdapter(
      new URL("http://ollama:11434/"),
      null,
      new RecordingTransport({ status, headers: {}, body: {} }),
    );
    await expect(adapter.generate(request)).rejects.toMatchObject({
      code:
        status === 400
          ? "INVALID_REQUEST"
          : status === 429
            ? "RATE_LIMITED"
            : "UNAVAILABLE",
    });
  });
});
