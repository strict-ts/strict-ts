import type { Diagnostic } from '@strict-ts/core';
import { err, ok, type Result } from '@strict-ts/std';

/**
 * The violations a team accepts for now: a count per rule per file. Counting, rather than recording lines, keeps the
 * file stable when code moves, so it merges without conflicts.
 */
export interface Baseline {
  readonly version: 1;
  readonly files: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/**
 * Whether a diagnostic can be recorded. The compiler's own errors (`TS2322`…) cannot: a baseline tolerates what
 * strict-ts adds to `tsc`, never what `tsc` already refuses. Neither can a diagnostic that belongs to no file.
 */
export const isRecordable = (diagnostic: Diagnostic): boolean => diagnostic.file !== '' && !/^TS\d+$/.test(diagnostic.rule);

const sorted = <T>(entries: readonly (readonly [string, T])[]): Record<string, T> =>
  Object.fromEntries(entries.toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** Counts the recordable diagnostics per rule per file, files and rules sorted. */
export function toBaseline(found: readonly Diagnostic[]): Baseline {
  const counts = new Map<string, Map<string, number>>();
  for (const { file, rule } of found.filter(isRecordable)) {
    const rules = counts.get(file) ?? new Map<string, number>();
    rules.set(rule, (rules.get(rule) ?? 0) + 1);
    counts.set(file, rules);
  }
  return { version: 1, files: sorted([...counts].map(([file, rules]) => [file, sorted([...rules])] as const)) };
}

/** The file's exact content: the same violations always give the same bytes. */
export const serializeBaseline = (baseline: Baseline): string => `${JSON.stringify(baseline, undefined, 2)}\n`;

export const countViolations = (baseline: Baseline): number =>
  Object.values(baseline.files).reduce((sum, rules) => sum + Object.values(rules).reduce((a, b) => a + b, 0), 0);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

/** Reads the content of a baseline file. A file it does not fully understand is an error: it allows nothing. */
export function parseBaseline(content: unknown): Result<Baseline, string> {
  if (!isRecord(content)) return err('object expected at the root');
  if (content['version'] !== 1) return err('"version": 1 expected');
  const files = content['files'];
  if (!isRecord(files)) return err('"files": object expected');
  const checked: Record<string, Readonly<Record<string, number>>> = {};
  for (const [file, rules] of Object.entries(files)) {
    if (!isRecord(rules)) return err(`"${file}": object expected`);
    const counts: Record<string, number> = {};
    for (const [rule, count] of Object.entries(rules)) {
      if (!isCount(count)) return err(`"${file}" "${rule}": a positive whole number expected`);
      counts[rule] = count;
    }
    checked[file] = counts;
  }
  return ok({ version: 1, files: checked });
}

/** What the gate found, split by what the baseline allows. */
export interface Comparison {
  /** What fails the gate: violations beyond the baseline, and everything a baseline cannot hold. */
  readonly refused: readonly Diagnostic[];
  /** Violations the baseline allows: not reported, not failing. */
  readonly baselined: readonly Diagnostic[];
  /** For a refused violation of a rule and file the baseline knows: how many it allows there. */
  readonly allowed: (diagnostic: Diagnostic) => number | undefined;
  /** Entries that allow more than what is found: a fixed violation could come back under them. */
  readonly stale: readonly StaleEntry[];
  /** How many files of the baseline now hold no violation at all: migrated out of it. */
  readonly migratedFiles: number;
}

export interface StaleEntry {
  readonly file: string;
  readonly rule: string;
  readonly recorded: number;
  readonly found: number;
}

/**
 * Matches by count per rule per file, not by line: moving code inside a file changes nothing. A file and rule that
 * hold more violations than recorded are refused whole, since no one can tell which of them is the new one.
 */
export function compare(found: readonly Diagnostic[], baseline: Baseline): Comparison {
  const actual = toBaseline(found).files;
  const allowance = (d: Diagnostic): number => (isRecordable(d) ? (baseline.files[d.file]?.[d.rule] ?? 0) : 0);
  const within = (d: Diagnostic): boolean => isRecordable(d) && (actual[d.file]?.[d.rule] ?? 0) <= allowance(d);
  return {
    refused: found.filter((d) => !within(d)),
    baselined: found.filter(within),
    allowed: (d) => (allowance(d) > 0 ? allowance(d) : undefined),
    stale: Object.entries(baseline.files).flatMap(([file, rules]) =>
      Object.entries(rules)
        .map(([rule, recorded]) => ({ file, rule, recorded, found: actual[file]?.[rule] ?? 0 }))
        .filter((entry) => entry.found < entry.recorded),
    ),
    migratedFiles: Object.keys(baseline.files).filter((file) => actual[file] === undefined).length,
  };
}
