import { attempt, textOf } from "@strict-ts/std";

// What may throw is called here, and leaves as a Result.
export const parseJson = (text: string) => attempt((): unknown => JSON.parse(text), textOf);
export const pattern = (source: string) => attempt(() => new RegExp(source, "i"), textOf);
export const fixed = (value: number, digits: number) => attempt(() => value.toFixed(digits), textOf);
export const whole = (value: number) => attempt(() => BigInt(value), textOf);
