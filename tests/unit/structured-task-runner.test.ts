import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ProviderRequestError } from "../../src/modules/providers/contracts";
import { FakeProvider } from "../../src/modules/providers/fake-provider";
import {
  StructuredTaskError,
  StructuredTaskRunner,
} from "../../src/modules/providers/structured-task-runner";
import { taskRegistry } from "../../src/modules/providers/task-registry";

const outputSchema = z.object({ value: z.string().min(1) }).strict();
const baseInput = {
  taskId: "AI-02" as const,
  model: "synthetic-model",
  system: "Return structured synthetic data.",
  user: "Synthetic input",
  schemaName: "synthetic_result",
  outputSchema,
  jsonSchema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
  correlationId: "synthetic-correlation",
};

const completed = (text: string, outputTokens = 1) => ({
  status: "completed" as const,
  text,
  model: "synthetic-model",
  usage: { outputTokens },
  warnings: [],
});

describe("structured task runner", () => {
  it("registers every documented task", () => {
    expect([...taskRegistry.keys()]).toEqual([
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
    ]);
    expect(taskRegistry.get("AI-01")?.timeoutMs).toBe(90_000);
    expect(taskRegistry.get("AI-01")?.maxOutputTokens).toBe(16_384);
    expect(taskRegistry.get("AI-02")?.timeoutMs).toBe(30_000);
  });

  it("validates output locally and returns a typed value", async () => {
    const provider = new FakeProvider([completed('{"value":"ok"}')]);
    const result = await new StructuredTaskRunner(provider).run(baseInput);
    expect(result.value).toEqual({ value: "ok" });
    expect(result.attempts).toBe(1);
    expect(provider.requests[0]).toMatchObject({
      taskVersion: "ai-02.v1",
      correlationId: "synthetic-correlation:attempt-1:request-1",
    });
  });

  it("repairs JSON or schema failures at most twice", async () => {
    const provider = new FakeProvider([
      completed("not-json"),
      completed('{"unexpected":true}'),
      completed('{"value":"repaired"}'),
    ]);
    const result = await new StructuredTaskRunner(provider).run(baseInput);
    expect(result).toMatchObject({ value: { value: "repaired" }, attempts: 3 });
    expect(provider.requests[1]?.user).toContain("invalid_json");
    expect(provider.requests[1]?.user).toContain("Synthetic input");
    expect(provider.requests[2]?.user).toContain("unrecognized_keys");
    expect(provider.requests[2]?.user).toContain("Synthetic input");
  });

  it("does not retry a hard semantic validation failure", async () => {
    const provider = new FakeProvider([
      completed('{"value":"unknown-evidence-id"}'),
      completed('{"value":"must-not-run"}'),
    ]);
    await expect(
      new StructuredTaskRunner(provider).run({
        ...baseInput,
        hardValidate: () => {
          throw new Error("unknown evidence");
        },
      }),
    ).rejects.toEqual(new StructuredTaskError("HARD_VALIDATION_FAILED"));
    expect(provider.requests).toHaveLength(1);
  });

  it("fails closed on refusal and timeout", async () => {
    const refusal = new FakeProvider([
      {
        status: "refused",
        refusal: "No",
        model: "synthetic-model",
        warnings: [],
      },
    ]);
    await expect(
      new StructuredTaskRunner(refusal).run(baseInput),
    ).rejects.toMatchObject({ code: "REFUSED" });

    const timeout = new FakeProvider([new ProviderRequestError("TIMEOUT")]);
    await expect(
      new StructuredTaskRunner(timeout).run(baseInput),
    ).rejects.toMatchObject({ code: "DEADLINE_EXCEEDED" });
  });

  it("bounds transient retries inside the task deadline", async () => {
    const provider = new FakeProvider([
      new ProviderRequestError("RATE_LIMITED"),
      new ProviderRequestError("UNAVAILABLE"),
      completed('{"value":"recovered"}'),
    ]);
    const delays: number[] = [];
    const result = await new StructuredTaskRunner(provider, (delay) => {
      delays.push(delay);
      return Promise.resolve();
    }).run(baseInput);
    expect(result.value).toEqual({ value: "recovered" });
    expect(delays).toEqual([100, 250]);
    expect(provider.requests).toHaveLength(3);
  });
});
