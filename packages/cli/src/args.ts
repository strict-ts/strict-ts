import { err, ok, type Result } from '@strict-ts/std';

export type Format = 'text' | 'json';

export type Command =
  | { readonly kind: 'help' }
  | {
      readonly kind: 'check';
      readonly project: string | undefined;
      readonly format: Format;
      /** Record today's violations instead of failing on them. */
      readonly updateBaseline: boolean;
    };

export const usage = [
  'Usage: strict-ts [options]',
  '',
  'Checks a TypeScript project in place of `tsc --noEmit`.',
  'Exit code: 0 when nothing is refused, 1 when something is, 2 when the project could not be checked.',
  '',
  'Options:',
  '  -p, --project <path>   A tsconfig.json, or a directory that holds one (default: the current directory)',
  '      --format <format>  text (default) or json',
  '      --update-baseline  Record the violations found in the baseline file, and exit with 0',
  '  -h, --help             Show this help',
].join('\n');

const isFormat = (value: string): value is Format => value === 'text' || value === 'json';

/** Reads the arguments after the program name. An argument it does not know is an error, never ignored. */
export function parseArgs(argv: readonly string[]): Result<Command, string> {
  let project: string | undefined;
  let format: Format | undefined;
  let updateBaseline = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '-h' || arg === '--help') return ok({ kind: 'help' });
    if (arg === '--update-baseline') {
      updateBaseline = true;
      continue;
    }
    const equals = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = equals === -1 ? arg : arg.slice(0, equals);
    if (name !== '-p' && name !== '--project' && name !== '--format') return err(`unknown argument: ${arg}`);
    const value = equals === -1 ? argv[++i] : arg.slice(equals + 1);
    if (value === undefined || value === '') return err(`${name} needs a value`);
    if (name === '--format') {
      if (!isFormat(value)) return err(`unknown format: ${value} (text or json)`);
      format = value;
    } else {
      project = value;
    }
  }
  if (updateBaseline && format !== undefined) return err('--update-baseline cannot be combined with --format');
  return ok({ kind: 'check', project, format: format ?? 'text', updateBaseline });
}
