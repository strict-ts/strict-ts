import { check } from '@strict-ts/core';
import { parseArgs, usage } from './args.js';
import { CONFIG_FILE, readConfig } from './config.js';
import { formatJson, formatText } from './format.js';
import { loadProject, readJsonFile } from './unsafe/project.js';

export { type Command, type Format, parseArgs, usage } from './args.js';
export { CONFIG_FILE, readConfig } from './config.js';
export { formatJson, formatText } from './format.js';

export interface Io {
  readonly cwd: string;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

/** The exit code of a project that could not be checked: it is not reported as safe. */
const UNCHECKED = 2;

/**
 * Runs the gate. Returns the process exit code: 0 when nothing is refused, 1 when something is, 2 when the project
 * could not be checked (wrong arguments, unreadable project or configuration, no file to check).
 */
export function run(argv: readonly string[], io: Io): number {
  const fail = (message: string): number => {
    io.err(`strict-ts: ${message}`);
    return UNCHECKED;
  };

  const command = parseArgs(argv);
  if (!command.ok) return fail(`${command.error}\n\n${usage}`);
  if (command.value.kind === 'help') {
    io.out(usage);
    return 0;
  }
  const { project, format } = command.value;

  const loaded = loadProject(io.cwd, project);
  if (!loaded.ok) return fail(loaded.error);
  const { rootDir, provider } = loaded.value;
  const config = readJsonFile(rootDir, CONFIG_FILE).andThen(readConfig);
  if (!config.ok) return fail(config.error);
  if (provider.files.length === 0) return fail(`no file to check under ${rootDir}`);

  const found = check(provider, config.value);
  if (format === 'json') io.out(formatJson(found));
  else for (const line of formatText(found)) io.out(line);
  return found.length === 0 ? 0 : 1;
}
