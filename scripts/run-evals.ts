import { spawn } from "node:child_process";
import path from "node:path";

import { parseEvalArguments } from "./eval-arguments";

const options = parseEvalArguments(process.argv.slice(2));
const child = spawn(
  process.execPath,
  [
    path.resolve("node_modules/vitest/vitest.mjs"),
    "run",
    "tests/evals",
    "--passWithNoTests",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      VITAE_EVAL_TASKS: options.tasks.join(","),
      VITAE_EVAL_SMOKE: options.smoke ? "true" : "false",
    },
  },
);
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
