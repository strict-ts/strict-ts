// unsafe/: the only place that touches what may throw or return `any`.
import { attempt, Option, type Result } from "@strict-ts/std";

export const parseJson = (text: string): Result<unknown, "invalid-json"> =>
  attempt((): unknown => JSON.parse(text), () => "invalid-json" as const);

export const readEnv = (name: string) => Option.from(process.env[name]);
