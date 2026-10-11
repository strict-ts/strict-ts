import type { Diagnostic } from '@strict-ts/core';

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
