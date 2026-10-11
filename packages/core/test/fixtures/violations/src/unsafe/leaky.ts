import { readFileSync } from "node:fs"; // allowed here: this is unsafe/

// Returns a bare string: the exception of readFileSync leaks into safe code.
export function readConfig(path: string): string { // expect: unsafe-boundary
  return readFileSync(path, "utf8");
}

// An export of type any.
export const raw: any = JSON.parse("{}"); // expect: unsafe-boundary

// Conforming: the error is turned into a value. `throw` and `any` are allowed inside unsafe/.
export function safeRead(path: string): { ok: true; value: string } | { ok: false; error: string } {
  try {
    return { ok: true, value: readFileSync(path, "utf8") };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
