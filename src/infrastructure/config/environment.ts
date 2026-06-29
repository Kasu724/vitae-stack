import "server-only";

import {
  parseServerEnvironment,
  type ServerEnvironment,
} from "./environment-schema";

export type { ServerEnvironment } from "./environment-schema";

export function readServerEnvironment(): ServerEnvironment {
  return parseServerEnvironment(process.env);
}
