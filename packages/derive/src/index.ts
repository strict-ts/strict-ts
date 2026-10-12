import { err, type Mut, ok, type Result } from '@strict-ts/std';
import { deriveFile, isCurrent, writeTarget } from './unsafe/files.js';

export { deriveSchemas, type Derived, schemaName, type Unfollowed } from './generate.js';
export { deriveFile } from './unsafe/files.js';

export interface Io {
  readonly cwd: string;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

export const usage = [
  'Usage: strict-ts-derive <file.ts> [Type…] [options]',
  '',
  'Generates the schemas of the types a file exports, from the types themselves: `InvoiceSchema` for `Invoice`,',
  'in `invoice.schema.ts`. Each one is annotated with its type, so the compiler checks that they agree.',
  '',
  'Options:',
  '  -o, --output <file>   Where to write the generated module (default: beside the file, `<name>.schema.ts`)',
  '      --check           Write nothing: fail when the generated module on disk is not what the types give',
  '  -h, --help            Show this help',
].join('\n');

interface Arguments {
  readonly file: string;
  readonly names: readonly string[];
  readonly output: string | undefined;
  readonly check: boolean;
}

function parseArgs(argv: readonly string[]): Result<Arguments | 'help', string> {
  const plain: Mut<string[]> = [];
  let output: string | undefined;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '-h' || arg === '--help') return ok('help');
    if (arg === '--check') {
      check = true;
    } else if (arg === '-o' || arg === '--output') {
      const value = argv[++i];
      if (value === undefined || value === '') return err(`${arg} needs a value`);
      output = value;
    } else if (arg.startsWith('-')) {
      return err(`unknown argument: ${arg}`);
    } else {
      plain.push(arg);
    }
  }
  const [file, ...names] = plain;
  return file === undefined ? err('which file?') : ok({ file, names, output, check });
}

/** Runs the generator. Returns the process exit code: 0 when it is done, 1 when `--check` finds a stale file, 2 otherwise. */
export function run(argv: readonly string[], io: Io): number {
  const fail = (message: string): number => {
    io.err(`strict-ts-derive: ${message}`);
    return 2;
  };
  const args = parseArgs(argv);
  if (!args.ok) return fail(`${args.error}\n\n${usage}`);
  if (args.value === 'help') {
    io.out(usage);
    return 0;
  }
  const { file, names, output, check } = args.value;
  const target = deriveFile(io.cwd, file, names, output);
  if (!target.ok) return fail(target.error);
  if (check) {
    const current = isCurrent(target.value);
    if (!current.ok) return fail(current.error);
    if (current.value) return 0;
    io.err(`strict-ts-derive: ${target.value.output} is not what the types of ${file} give: generate it again`);
    return 1;
  }
  const done = writeTarget(target.value);
  if (!done.ok) return fail(done.error);
  io.out(`${done.value}: ${target.value.derived.types.map((type) => `${type}Schema`).join(', ')}`);
  return 0;
}
