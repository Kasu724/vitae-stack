export interface EvalArguments {
  smoke: boolean;
  tasks: string[];
}

export function parseEvalArguments(
  arguments_: readonly string[],
): EvalArguments {
  const tasks = new Set<string>();
  let smoke = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--" || argument === "") continue;
    if (argument === "--smoke") {
      smoke = true;
      continue;
    }
    let taskValue: string | undefined;
    if (argument === "--task") {
      taskValue = arguments_[index + 1];
      index += 1;
    } else if (argument.startsWith("--task=")) {
      taskValue = argument.slice("--task=".length);
    } else {
      throw new Error(`Unknown evaluation argument: ${argument}`);
    }
    const parsed = taskValue
      ?.split(",")
      .map((task) => task.trim())
      .filter(Boolean);
    if (!parsed?.length || parsed.some((task) => !/^AI-\d{2}$/u.test(task)))
      throw new Error("Evaluation tasks must use AI-NN identifiers.");
    parsed.forEach((task) => tasks.add(task));
  }
  return { smoke, tasks: [...tasks] };
}
