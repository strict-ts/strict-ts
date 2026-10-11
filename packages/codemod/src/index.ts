import { err, ok, type Mut, type Result } from '@strict-ts/std';
import { FIXABLE, fixProject } from './unsafe/project.js';

export { blamedFixes } from './blame.js';
export { applyEdits, type Complaint, type Edit, type Fix, keepUnblamed, keepWhatHolds, type Placed, placesAfter, type Trial } from './fix.js';
export { readonlyFixes } from './fixes/readonly-types.js';
export { typePredicateFixes } from './fixes/type-predicate.js';
export { FIXABLE, fixProject, type Outcome, type Place } from './unsafe/project.js';

export interface Io {
  readonly cwd: string;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

export const usage = [
  'Usage: strict-ts-fix [options]',
  '',
  'Fixes what strict-ts refuses, where a fix is mechanical. A fix is kept only if the project still compiles and is refused for nothing more.',
  '',
  'Options:',
  '  -p, --project <path>  A tsconfig.json, or a directory that holds one (default: the current directory)',
  `      --rule <name>     Fix this rule only; may be repeated (${FIXABLE.join(', ')})`,
  '      --dry-run         Say what would be fixed, and write nothing',
  '  -h, --help            Show this help',
].join('\n');

interface Arguments {
  readonly project: string | undefined;
  readonly rules: readonly string[];
  readonly dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Result<Arguments | 'help', string> {
  let project: string | undefined;
  let dryRun = false;
  const rules: Mut<string[]> = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '-h' || arg === '--help') return ok('help');
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '-p' || arg === '--project' || arg === '--rule') {
      const value = argv[++i];
      if (value === undefined || value === '') return err(`${arg} needs a value`);
      if (arg !== '--rule') project = value;
      else if (FIXABLE.some((name) => name === value)) rules.push(value);
      else return err(`no automatic fix for the rule ${value} (${FIXABLE.join(', ')})`);
    } else {
      return err(`unknown argument: ${arg}`);
    }
  }
  return ok({ project, rules: rules.length === 0 ? FIXABLE : rules, dryRun });
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Runs the fixer. Returns the process exit code: 0 when it ran, 2 when the project could not be read. */
export function run(argv: readonly string[], io: Io): number {
  const fail = (message: string): number => {
    io.err(`strict-ts-fix: ${message}`);
    return 2;
  };
  const args = parseArgs(argv);
  if (!args.ok) return fail(`${args.error}\n\n${usage}`);
  if (args.value === 'help') {
    io.out(usage);
    return 0;
  }
  const { project, rules, dryRun } = args.value;
  const outcome = fixProject(io.cwd, project, rules, dryRun);
  if (!outcome.ok) return fail(outcome.error);
  const { applied, left, written } = outcome.value;
  for (const rule of rules) {
    const fixed = applied.filter((place) => place.rule === rule).length;
    const kept = left.filter((place) => place.rule === rule);
    io.out(`${rule}: ${count(fixed, 'fix', 'fixes')}${dryRun ? ' would be' : ''} applied, ${kept.length} left`);
    for (const place of kept) io.out(`  ${place.file}:${place.line}:${place.column} left as it is: with the fix the project does not compile, or is refused for more`);
  }
  io.out(dryRun ? 'dry run: nothing written' : `${count(written.length, 'file', 'files')} written`);
  return 0;
}
