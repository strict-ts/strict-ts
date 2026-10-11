// Each block triggers one rule on purpose. A trailing `// expect: <rule>` names what the line must be refused for.
import { readFileSync } from "node:fs"; // expect: no-external-import
import { err, ok, type Result } from "@strict-ts/std";

type Status = "draft" | "sent" | "paid";

export function loose(x: any): string { // expect: no-any
  return String(x); // expect: no-throwing-call
}

export function parsed(text: string): string {
  const data = JSON.parse(text); // expect: no-any, no-throwing-call
  return String(data); // expect: no-throwing-call
}

export function cast(value: unknown): string {
  return value as string; // expect: no-cast
}

export function first(items: readonly string[]): string {
  return items[0]!; // expect: no-non-null
}

export function fail(): never {
  throw new Error("boom"); // expect: no-throw
}

export const nothing: string | null = null; // expect: no-null

export function divide(a: number, b: number): Result<number, "div-by-zero"> {
  return b === 0 ? err("div-by-zero") : ok(a / b);
}

export async function save(): Promise<void> {}

export function caller(): void {
  divide(1, 0); // expect: must-use
  save(); // expect: must-use
}

export function label(s: Status): string {
  switch (s) { // expect: exhaustive-switch
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
  }
  return "";
}

export function anyString(s: string): number {
  switch (s) { // expect: exhaustive-switch
    case "a":
      return 1;
  }
  return 0;
}

export const isText = (value: unknown): value is string => value !== undefined; // expect: no-type-predicate

declare const injected: number; // expect: no-ambient
export const copied = injected;

export let late!: string; // expect: no-non-null

export function append(list: number[]): void { // expect: readonly-types
  list.push(1); // expect: no-param-mutation
}

// @ts-ignore
export const masked = 1;

export const config = readFileSync;
