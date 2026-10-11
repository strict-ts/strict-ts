import { check, type Diagnostic } from '@strict-ts/core';
import { parseArgs, usage } from './args.js';
import { compare, countViolations, isRecordable, parseBaseline, serializeBaseline, toBaseline } from './baseline.js';
import { CONFIG_FILE, readSettings } from './config.js';
import { formatJson, formatText } from './format.js';
import { loadProject, readJsonFile, writeTextFile } from './unsafe/project.js';

export { type BaselineMode, type Command, type Format, parseArgs, usage } from './args.js';
export {
  type Baseline,
  type Comparison,
  type StaleEntry,
  compare,
  isRecordable,
  parseBaseline,
  serializeBaseline,
  toBaseline,
} from './baseline.js';
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
 * With `--update-baseline`, the violations are recorded instead of refused; once recorded, only what goes beyond the
 * record is refused.
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
  const { project, format, baseline: mode, strictBaseline } = command.value;

  const loaded = loadProject(io.cwd, project);
  if (!loaded.ok) return fail(loaded.error);
  const { rootDir, provider } = loaded.value;
  const settings = readJsonFile(rootDir, CONFIG_FILE).andThen(readSettings);
  if (!settings.ok) return fail(settings.error);
  if (provider.files.length === 0) return fail(`no file to check under ${rootDir}`);

  const found = check(provider, settings.value.config);
  if (mode === 'update') {
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
  if (mode === 'ignore') return report(found);

  const recorded = readJsonFile(rootDir, settings.value.baseline);
  if (!recorded.ok) return fail(recorded.error);
  if (!recorded.value.some) return report(found);
  const baseline = parseBaseline(recorded.value.value);
  if (!baseline.ok) return fail(`${settings.value.baseline}: ${baseline.error}`);

  const { refused, baselined, allowed, stale, migratedFiles } = compare(found, baseline.value);
  const counts = { new: refused.length, baselined: baselined.length, stale: stale.length, migratedFiles };
  if (format === 'json') {
    io.out(formatJson(refused, { baseline: { ...counts, staleEntries: stale } }));
  } else {
    const note = (d: Diagnostic): string | undefined => {
      const allowance = allowed(d);
      return allowance === undefined ? undefined : `${allowance} allowed by the baseline`;
    };
    for (const line of formatText(refused, note)) io.out(line);
    for (const entry of stale) {
      io.out(`warning: stale baseline entry ${entry.file} ${entry.rule}: ${entry.recorded} recorded, ${entry.found} found`);
    }
    if (stale.length > 0) io.out('  help: run --update-baseline, so that what was fixed cannot come back');
    io.out(
      `${counts.new} new, ${counts.baselined} baselined, ${counts.stale} stale, ` +
        `${migratedFiles} ${migratedFiles === 1 ? 'file' : 'files'} out of the baseline`,
    );
  }
  return refused.length > 0 || (strictBaseline && stale.length > 0) ? 1 : 0;

  function report(refused: readonly Diagnostic[]): number {
    if (format === 'json') io.out(formatJson(refused));
    else for (const line of formatText(refused)) io.out(line);
    return refused.length === 0 ? 0 : 1;
  }
}
