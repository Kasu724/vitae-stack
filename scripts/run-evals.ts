import { spawn } from "node:child_process";
import path from "node:path";

const tasks = process.argv
  .filter((argument) => argument.startsWith("--task="))
  .flatMap((argument) => argument.slice("--task=".length).split(","));
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
      VITAE_EVAL_TASKS: tasks.join(","),
      VITAE_EVAL_SMOKE: process.argv.includes("--smoke") ? "true" : "false",
    },
  },
);
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
