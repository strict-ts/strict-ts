import { err, ok, type Result } from '@strict-ts/std';
import { wrapModule, writeWrapper } from './unsafe/project.js';

export { generateWrapper, type Wrapper } from './generate.js';
export { wrapModule } from './unsafe/project.js';

export interface Io {
  readonly cwd: string;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

export const usage = [
  'Usage: strict-ts-wrap <module> [options]',
  '',
  "Generates the unsafe/ wrapper of a dependency from its declarations: every function returns a Result.",
  '',
  'Options:',
  '  -p, --project <path>  The tsconfig.json that resolves the module, or its directory (default: the current directory)',
  '  -o, --output <file>   Write the wrapper to a file instead of the standard output',
  '  -h, --help            Show this help',
].join('\n');

interface Arguments {
  readonly module: string;
  readonly project: string | undefined;
  readonly output: string | undefined;
}

function parseArgs(argv: readonly string[]): Result<Arguments | 'help', string> {
  let module: string | undefined;
  let project: string | undefined;
  let output: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '-h' || arg === '--help') return ok('help');
    if (arg === '-p' || arg === '--project' || arg === '-o' || arg === '--output') {
      const value = argv[++i];
      if (value === undefined || value === '') return err(`${arg} needs a value`);
      if (arg === '-p' || arg === '--project') project = value;
      else output = value;
    } else if (arg.startsWith('-')) {
      return err(`unknown argument: ${arg}`);
    } else if (module === undefined) {
      module = arg;
    } else {
      return err(`one module at a time: ${module}, then ${arg}`);
    }
  }
  return module === undefined ? err('which module?') : ok({ module, project, output });
}

/** Runs the generator. Returns the process exit code: 0 when the wrapper was generated, 2 otherwise. */
export function run(argv: readonly string[], io: Io): number {
  const fail = (message: string): number => {
    io.err(`strict-ts-wrap: ${message}`);
    return 2;
  };
  const args = parseArgs(argv);
  if (!args.ok) return fail(`${args.error}\n\n${usage}`);
  if (args.value === 'help') {
    io.out(usage);
    return 0;
  }
  const { module, project, output } = args.value;
  const wrapper = wrapModule(io.cwd, project, module);
  if (!wrapper.ok) return fail(wrapper.error);
  if (output === undefined) {
    io.out(wrapper.value.text.trimEnd());
    return 0;
  }
  const written = writeWrapper(io.cwd, output, wrapper.value.text);
  if (!written.ok) return fail(written.error);
  io.err(`${output}: ${wrapper.value.wrapped.length} wrapped, ${wrapper.value.skipped.length} not wrapped`);
  return 0;
}
