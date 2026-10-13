import { err, ok, type Result } from '@strict-ts/std';
import { mut } from '@strict-ts/std';

export type Format = 'text' | 'json' | 'sarif';

export type BaselineMode = 'use' | 'ignore' | 'update';

export type Command =
  | { readonly kind: 'help' }
  | {
      readonly kind: 'check';
      readonly project: string | undefined;
      readonly format: Format;
      /** A file to write the report to, instead of the standard output. */
      readonly output: string | undefined;
      /** `use` the baseline file when there is one, `ignore` it, or `update` it with today's violations. */
      readonly baseline: BaselineMode;
      /** Fail when the baseline allows more than what is found, so that it can only shrink. */
      readonly strictBaseline: boolean;
      /** Reuse the result of the files that did not change since the last run, and record this one. */
      readonly cache: boolean;
      /** Say on the error stream how many files were checked, and in how long. */
      readonly timing: boolean;
    };

export const usage = [
  'Usage: strict-ts [options]',
  '',
  'Checks a TypeScript project in place of `tsc --noEmit`.',
  'Exit code: 0 when nothing is refused, 1 when something is, 2 when the project could not be checked.',
  '',
  'Options:',
  '  -p, --project <path>   A tsconfig.json, or a directory that holds one (default: the current directory)',
  '      --format <format>  text (default), json or sarif',
  '      --output <file>    Write the report to a file instead of the standard output',
  '      --update-baseline  Record the violations found in the baseline file, and exit with 0',
  '      --no-baseline      Ignore the baseline file: refuse every violation',
  '      --strict-baseline  Fail when the baseline allows more than what is found',
  '      --cache            Check only the files that changed since the last run, or that import one that did',
  '      --timing           Say how many files were checked, and in how long',
  '  -h, --help             Show this help',
].join('\n');

/** The options that take no value. */
const FLAGS = ['--update-baseline', '--no-baseline', '--strict-baseline', '--cache', '--timing'];

const isFormat = (value: string) => value === 'text' || value === 'json' || value === 'sarif';

/** Reads the arguments after the program name. An argument it does not know is an error, never ignored. */
export function parseArgs(argv: readonly string[]): Result<Command, string> {
  let project: string | undefined;
  let format: Format | undefined;
  let output: string | undefined;
  const flags = mut(new Set<string>());
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '-h' || arg === '--help') return ok({ kind: 'help' });
    if (FLAGS.includes(arg)) {
      flags.add(arg);
      continue;
    }
    const equals = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = equals === -1 ? arg : arg.slice(0, equals);
    if (name !== '-p' && name !== '--project' && name !== '--format' && name !== '--output') {
      return err(`unknown argument: ${arg}`);
    }
    const value = equals === -1 ? argv[++i] : arg.slice(equals + 1);
    if (value === undefined || value === '') return err(`${name} needs a value`);
    if (name === '--format') {
      if (!isFormat(value)) return err(`unknown format: ${value} (text, json or sarif)`);
      format = value;
    } else if (name === '--output') {
      output = value;
    } else {
      project = value;
    }
  }
  const update = flags.has('--update-baseline');
  if (update && format !== undefined) return err('--update-baseline cannot be combined with --format');
  if (update && output !== undefined) return err('--update-baseline cannot be combined with --output');
  if (update && flags.has('--no-baseline')) return err('--update-baseline cannot be combined with --no-baseline');
  const strictBaseline = flags.has('--strict-baseline');
  const other = update ? '--update-baseline' : '--no-baseline';
  if (strictBaseline && (update || flags.has('--no-baseline'))) return err(`--strict-baseline cannot be combined with ${other}`);
  const baseline = update ? 'update' : flags.has('--no-baseline') ? 'ignore' : 'use';
  return ok({
    kind: 'check',
    project,
    format: format ?? 'text',
    output,
    baseline,
    strictBaseline,
    cache: flags.has('--cache'),
    timing: flags.has('--timing'),
  });
}
