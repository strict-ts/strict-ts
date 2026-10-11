import { check, type Config, defaultConfig, type TypeProvider } from '@strict-ts/core';

/** Runs the gate on a program. Returns the process exit code: 0 when nothing is refused, 1 otherwise. */
export function run(provider: TypeProvider, print: (line: string) => void, config: Config = defaultConfig): number {
  const found = check(provider, config);
  for (const d of found) {
    print(`${d.file}:${d.start.line}:${d.start.column} ${d.rule} ${d.message}`);
    if (d.help !== undefined) print(`  help: ${d.help}`);
  }
  return found.length === 0 ? 0 : 1;
}
