import { check, type Diagnostic, type Rule } from '@strict-ts/core';

const RULES: readonly Rule[] = [];

/** Runs the gate on the given files. Returns the process exit code: 0 when nothing is refused, 1 otherwise. */
export function run(files: readonly string[], print: (line: string) => void): number {
  const found: readonly Diagnostic[] = check({ files }, RULES);
  for (const d of found) {
    print(`${d.file}:${d.start.line}:${d.start.column} ${d.rule} ${d.message}`);
  }
  return found.length === 0 ? 0 : 1;
}
