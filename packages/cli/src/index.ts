import { check } from '@strict-ts/core';
import { parseArgs, usage } from './args.js';
import { countViolations, isRecordable, serializeBaseline, toBaseline } from './baseline.js';
import { CONFIG_FILE, readSettings } from './config.js';
import { formatJson, formatText } from './format.js';
import { loadProject, readJsonFile, writeTextFile } from './unsafe/project.js';

export { type Command, type Format, parseArgs, usage } from './args.js';
export { type Baseline, isRecordable, serializeBaseline, toBaseline } from './baseline.js';
export { BASELINE_FILE, CONFIG_FILE, defaultSettings, readSettings, type Settings } from './config.js';
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
 * With `--update-baseline`, the violations are recorded instead of refused.
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
  const { project, format, updateBaseline } = command.value;

  const loaded = loadProject(io.cwd, project);
  if (!loaded.ok) return fail(loaded.error);
  const { rootDir, provider } = loaded.value;
  const settings = readJsonFile(rootDir, CONFIG_FILE).andThen(readSettings);
  if (!settings.ok) return fail(settings.error);
  if (provider.files.length === 0) return fail(`no file to check under ${rootDir}`);

  const found = check(provider, settings.value.config);
  if (updateBaseline) {
    const baseline = toBaseline(found);
    const written = writeTextFile(rootDir, settings.value.baseline, serializeBaseline(baseline));
    if (!written.ok) return fail(written.error);
    const files = Object.keys(baseline.files).length;
    io.out(`${settings.value.baseline}: ${countViolations(baseline)} recorded in ${files} ${files === 1 ? 'file' : 'files'}`);
    // What a baseline cannot hold stays refused: recording must not turn a compiler error into a pass.
    const left = found.filter((diagnostic) => !isRecordable(diagnostic));
    if (left.length === 0) return 0;
    io.out('');
    for (const line of formatText(left)) io.out(line);
    io.out('not recorded: a baseline holds rule violations only, not compiler errors');
    return 1;
  }
  if (format === 'json') io.out(formatJson(found));
  else for (const line of formatText(found)) io.out(line);
  return found.length === 0 ? 0 : 1;
}
