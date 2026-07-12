import { describe, expect, it } from "vitest";

import { parseEvalArguments } from "../../scripts/eval-arguments";

describe("evaluation CLI arguments", () => {
  it("accepts both documented task syntaxes and de-duplicates tasks", () => {
    expect(
      parseEvalArguments([
        "--task",
        "AI-02,AI-03",
        "--task=AI-03,AI-04",
        "--smoke",
      ]),
    ).toEqual({ smoke: true, tasks: ["AI-02", "AI-03", "AI-04"] });
  });

  it("fails closed on missing, malformed, or unknown arguments", () => {
    expect(() => parseEvalArguments(["--task"])).toThrow(
      "Evaluation tasks must use AI-NN identifiers.",
    );
    expect(() => parseEvalArguments(["--task=all"])).toThrow(
      "Evaluation tasks must use AI-NN identifiers.",
    );
    expect(() => parseEvalArguments(["--smkoe"])).toThrow(
      "Unknown evaluation argument",
    );
  });
});
