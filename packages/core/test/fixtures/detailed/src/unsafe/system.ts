// unsafe/: the calls that may throw or return `any` are enclosed here.
import { randomUUID } from "node:crypto";
import { attempt, type Result } from "@strict-ts/std";

export type SystemError = { readonly kind: "system"; readonly message: string };

const toSystemError = (cause: unknown): SystemError => ({ kind: "system", message: String(cause) });

export function newId(): Result<string, SystemError> {
  return attempt(() => randomUUID(), toSystemError);
}

export function parseJson(text: string): Result<unknown, SystemError> {
  return attempt((): unknown => JSON.parse(text), toSystemError);
}
