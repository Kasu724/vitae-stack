import { z } from "zod";

export const aiTaskIds = [
  "AI-01",
  "AI-02",
  "AI-03",
  "AI-04",
  "AI-05",
  "AI-06",
  "AI-07",
  "AI-08",
  "AI-09",
  "AI-10",
  "AI-11",
] as const;

export const aiTaskIdSchema = z.enum(aiTaskIds);
export type AiTaskId = z.infer<typeof aiTaskIdSchema>;

export interface ProviderRequest {
  taskId: AiTaskId;
  taskVersion: string;
  model: string;
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  correlationId: string;
}

export type ProviderResponse =
  | {
      status: "completed";
      text: string;
      model: string;
      providerRequestId?: string;
      finishReason?: string;
      usage?: { inputTokens?: number; outputTokens?: number };
      warnings: string[];
    }
  | {
      status: "refused";
      refusal: string;
      model: string;
      providerRequestId?: string;
      usage?: { inputTokens?: number; outputTokens?: number };
      warnings: string[];
    };

export interface AIProvider {
  readonly kind: "openai_compatible" | "ollama" | "fake";
  generate(request: ProviderRequest): Promise<ProviderResponse>;
}

export interface ProviderHttpResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: unknown;
}

export interface ProviderHttpTransport {
  postJson(input: {
    url: URL;
    headers: Record<string, string>;
    body: unknown;
    timeoutMs: number;
  }): Promise<ProviderHttpResponse>;
}

export class ProviderRequestError extends Error {
  public constructor(
    public readonly code:
      | "AUTHENTICATION"
      | "INVALID_RESPONSE"
      | "RATE_LIMITED"
      | "TIMEOUT"
      | "UNAVAILABLE",
  ) {
    super("The model provider request failed.");
    this.name = "ProviderRequestError";
  }
}
