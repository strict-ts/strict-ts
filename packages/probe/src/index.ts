import { effectsLedger } from '@strict-ts/core';
import { err, ok, type Result } from '@strict-ts/std';
import { formatReport, hasFailures, summarise } from './report.js';
import { readEvents } from './unsafe/files.js';

export type { Event, Shape, Site } from './events.js';
export { type Finding, formatReport, hasFailures, type Report, summarise } from './report.js';
export { readEvents } from './unsafe/files.js';
export { allProbes, instrument, type Instrumented, PROBE, type Probes } from './transform.js';
export { type Emitted, type Instrumenter, openInstrumenter } from './unsafe/emit.js';
export { type ProbeOptions, strictTsProbe, type VitePlugin } from './unsafe/vite.js';

export interface Io {
  readonly cwd: string;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

/** Where the probes write unless told otherwise, relative to where the tests ran. */
export const EVENTS_FILE = '.strict-ts-probe/events.jsonl';

export const usage = [
  'Usage: strict-ts-probe report [events file]',
  '',
  'Reads what the probes saw while the instrumented tests ran, and says what contradicts what strict-ts took on trust:',
  'a function the effects ledger calls safe that threw, an exception that left an unsafe directory, a cast that was not true.',
  'Exit code: 0 when nothing contradicts, 1 when something does, 2 when there is nothing to read.',
  '',
  `The events file defaults to ${EVENTS_FILE}. To produce it, load the plugin of @strict-ts/probe/vite in the test runner.`,
].join('\n');

function parseArgs(argv: readonly string[]): Result<string | 'help', string> {
  const [command, file, ...rest] = argv;
  if (command === '-h' || command === '--help' || command === undefined) return ok('help');
  if (command !== 'report') return err(`unknown command: ${command}`);
  if (rest.length > 0) return err(`unknown argument: ${rest[0] ?? ''}`);
  return ok(file ?? EVENTS_FILE);
}

/** Runs the report. Returns the process exit code. */
export function run(argv: readonly string[], io: Io): number {
  const fail = (message: string): number => {
    io.err(`strict-ts-probe: ${message}`);
    return 2;
  };
  const args = parseArgs(argv);
  if (!args.ok) return fail(`${args.error}\n\n${usage}`);
  if (args.value === 'help') {
    io.out(usage);
    return 0;
  }
  const read = readEvents(io.cwd, args.value);
  if (!read.ok) return fail(read.error);
  const events = read.value;
  if (events.length === 0) return fail(`${args.value} holds no event: did the tests run with the probes?`);
  const report = summarise(events, effectsLedger);
  for (const line of formatReport(report)) io.out(line);
  return hasFailures(report) ? 1 : 0;
}
