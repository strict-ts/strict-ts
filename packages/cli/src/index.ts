import { check, compareDiagnostics, type Diagnostic, rules } from '@strict-ts/core';
import { ok, Option } from '@strict-ts/std';
import { parseArgs, usage } from './args.js';
import { compare, countViolations, isRecordable, parseBaseline, serializeBaseline, toBaseline } from './baseline.js';
import { type Cache, parseCache, stillValid } from './cache.js';
import { CONFIG_FILE, readSettings } from './config.js';
import { formatJson, formatText } from './format.js';
import { json } from './json.js';
import { formatSarif } from './sarif.js';
import { loadProject, readJsonFile, writeTextFile } from './unsafe/project.js';
import { VERSION } from './version.js';

export { type Cache, type Facts, type FileFacts, fileKeys, parseCache, stillValid } from './cache.js';
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
export { configSchema, serializeConfigSchema } from './config-schema.js';
export { formatJson, formatText } from './format.js';
export { formatSarif, type SarifInput } from './sarif.js';
export { VERSION } from './version.js';

export interface Io {
  readonly cwd: string;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

/** Where --cache keeps the results of a run, relative to the project root. */
export const CACHE_FILE = 'node_modules/.cache/strict-ts/cache.json';

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
  const { project, format, output, baseline: mode, strictBaseline, cache: useCache, timing } = command.value;

  const started = Date.now();
  const loaded = loadProject(io.cwd, project);
  if (!loaded.ok) return fail(loaded.error);
  const { rootDir, files } = loaded.value;
  const settings = readJsonFile(rootDir, CONFIG_FILE).andThen(readSettings);
  if (!settings.ok) return fail(settings.error);
  if (files.length === 0) return fail(`no file to check under ${rootDir}`);

  // With --cache, a file whose text and imports did not change keeps the result of the last run.
  const facts = useCache ? loaded.value.facts(json(settings.value.config)) : undefined;
  const previous = facts === undefined ? undefined : parseCache(readJsonFile(rootDir, CACHE_FILE).unwrapOr(Option.none).unwrapOr(undefined));
  const reused = facts === undefined ? new Map<string, readonly Diagnostic[]>() : stillValid(previous, facts);
  const toCheck = new Set(files.filter((file) => !reused.has(file)));
  const fresh = check(loaded.value.provider(useCache ? toCheck : undefined), settings.value.config);
  const found = [...fresh, ...[...reused.values()].flat()].toSorted(compareDiagnostics);
  if (facts !== undefined) {
    const record: Cache = {
      version: 1,
      environment: facts.environment,
      files: Object.fromEntries(files.map((file) => [file, { key: facts.keys[file] ?? '', diagnostics: found.filter((d) => d.file === file) }])),
    };
    // A cache that cannot be written costs the next run its speed, not its result.
    void writeTextFile(rootDir, CACHE_FILE, json(record));
  }
  if (timing) {
    const milliseconds = Date.now() - started;
    io.err(`strict-ts: ${toCheck.size} of ${files.length} files checked, ${reused.size} from the cache, ${milliseconds} ms`);
  }

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

  /** Sends the report where it was asked for. A report that could not be written is a project not checked. */
  const emit = (lines: readonly string[], code: number): number => {
    if (output === undefined) {
      for (const line of lines) io.out(line);
      return code;
    }
    const written = writeTextFile(io.cwd, output, lines.length === 0 ? '' : `${lines.join('\n')}\n`);
    return written.ok ? code : fail(written.error);
  };
  const enabled = rules.filter((rule) => settings.value.config.rules?.includes(rule.name) ?? true);
  const sarif = (refused: readonly Diagnostic[], baselined: readonly Diagnostic[], usesBaseline: boolean): string =>
    formatSarif({ version: VERSION, rules: enabled, refused, baselined, usesBaseline });

  const recorded = mode === 'ignore' ? ok(Option.none) : readJsonFile(rootDir, settings.value.baseline);
  if (!recorded.ok) return fail(recorded.error);
  if (!recorded.value.some) {
    const code = found.length === 0 ? 0 : 1;
    if (format === 'sarif') return emit([sarif(found, [], false)], code);
    return emit(format === 'json' ? [formatJson(found)] : formatText(found), code);
  }
  const baseline = parseBaseline(recorded.value.value);
  if (!baseline.ok) return fail(`${settings.value.baseline}: ${baseline.error}`);

  const { refused, baselined, allowed, stale, migratedFiles } = compare(found, baseline.value);
  const counts = { new: refused.length, baselined: baselined.length, stale: stale.length, migratedFiles };
  const code = refused.length > 0 || (strictBaseline && stale.length > 0) ? 1 : 0;
  if (format === 'sarif') return emit([sarif(refused, baselined, true)], code);
  if (format === 'json') return emit([formatJson(refused, { baseline: { ...counts, staleEntries: stale } })], code);

  const note = (d: Diagnostic): string | undefined => {
    const allowance = allowed(d);
    return allowance === undefined ? undefined : `${allowance} allowed by the baseline`;
  };
  const warnings = stale.map(
    (entry) => `warning: stale baseline entry ${entry.file} ${entry.rule}: ${entry.recorded} recorded, ${entry.found} found`,
  );
  const summary =
    `${counts.new} new, ${counts.baselined} baselined, ${counts.stale} stale, ` +
    `${migratedFiles} ${migratedFiles === 1 ? 'file' : 'files'} out of the baseline`;
  return emit(
    [
      ...formatText(refused, note),
      ...warnings,
      ...(stale.length > 0 ? ['  help: run --update-baseline, so that what was fixed cannot come back'] : []),
      summary,
    ],
    code,
  );
}
