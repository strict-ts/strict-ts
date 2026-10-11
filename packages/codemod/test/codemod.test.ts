import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as gate } from '@strict-ts/cli';
import { afterEach, describe, expect, test } from 'vitest';
import { applyEdits, type Fix, keepWhatHolds, run } from '../src/index.js';

const fixture = fileURLToPath(new URL('fixtures/app/', import.meta.url));
const copies: string[] = [];
function project(): string {
  const directory = mkdtempSync(join(tmpdir(), 'strict-ts-fix-'));
  copies.push(directory);
  cpSync(fixture, directory, { recursive: true });
  return directory;
}
afterEach(() => {
  for (const directory of copies.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const fix = (cwd: string, ...argv: readonly string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(argv, { cwd, out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out, err };
};
/** What the gate still refuses, as `file rule` with a count. */
const refused = (cwd: string): Record<string, number> => {
  const out: string[] = [];
  gate(['--format', 'json'], { cwd, out: (line) => out.push(line), err: () => {} });
  const counts: Record<string, number> = {};
  for (const d of JSON.parse(out.join('\n')).diagnostics) counts[`${d.file} ${d.rule}`] = (counts[`${d.file} ${d.rule}`] ?? 0) + 1;
  return counts;
};
const read = (cwd: string, file: string): string => readFileSync(join(cwd, file), 'utf8');

describe('strict-ts-fix', () => {
  test('before: the project compiles and is refused for its mutable types and its written predicates', () => {
    expect(refused(project())).toEqual({
      'src/cart.ts readonly-types': 21,
      'src/guards.ts no-type-predicate': 2,
      'src/mutated.ts no-param-mutation': 1,
      'src/mutated.ts readonly-types': 5,
    });
  });

  test('fixes what can be, and says what it left', () => {
    const directory = project();
    expect(fix(directory)).toEqual({
      code: 0,
      out: [
        'readonly-types: 24 fixes applied, 2 left',
        '  src/mutated.ts:3:3 left as it is: the project does not compile with the fix',
        '  src/mutated.ts:12:15 left as it is: the project does not compile with the fix',
        'no-type-predicate: 1 fix applied, 1 left',
        '  src/guards.ts:7:34 left as it is: the project does not compile with the fix',
        '3 files written',
      ],
      err: [],
    });
  });

  test('after: the project still compiles, and only what really changes is left', () => {
    const directory = project();
    fix(directory);
    const left = refused(directory);
    expect(Object.keys(left).some((key) => key.includes(' TS'))).toBe(false);
    expect(left).toEqual({
      'src/guards.ts no-type-predicate': 1,
      'src/mutated.ts no-param-mutation': 1,
      'src/mutated.ts readonly-types': 2,
    });
  });

  test('writes read-only types as a person would', () => {
    const directory = project();
    fix(directory);
    expect(read(directory, 'src/cart.ts')).toBe(
      [
        '// Existing code, written without a thought for mutability.',
        'export interface Line {',
        '  readonly label: string;',
        '  readonly price: number;',
        '}',
        '',
        'export interface Cart {',
        '  readonly id: string;',
        '  readonly lines: readonly Line[];',
        '  readonly tags: ReadonlySet<string>;',
        '  readonly byLabel: ReadonlyMap<string, Line>;',
        '  readonly notes: Readonly<Record<string, string>>;',
        '  readonly grid: readonly (readonly number[])[];',
        '  readonly pair: readonly [number, number];',
        '  readonly [extra: string]: unknown;',
        '}',
        '',
        'export class Counter {',
        '  static readonly start = 0;',
        '  constructor(public readonly step: number) {}',
        '}',
        '',
        'export const total = (lines: ReadonlyArray<Line>): number => lines.reduce((sum, line) => sum + line.price, 0);',
        '',
        'export const labels = (cart: Cart): readonly string[] => cart.lines.map((line) => line.label);',
        '',
      ].join('\n'),
    );
  });

  test('removes a written predicate only where the compiler infers it', () => {
    const directory = project();
    fix(directory);
    const guards = read(directory, 'src/guards.ts');
    expect(guards).toContain('export const isStatus = (value: string) => value === "draft" || value === "sent";');
    expect(guards).toContain('const isText = (value: unknown): value is string => value !== undefined;');
  });

  test('leaves unsafe/ alone', () => {
    const directory = project();
    fix(directory);
    expect(read(directory, 'src/unsafe/raw.ts')).toBe(readFileSync(join(fixture, 'src/unsafe/raw.ts'), 'utf8'));
  });

  test('a second run has nothing more to fix', () => {
    const directory = project();
    fix(directory);
    const before = read(directory, 'src/cart.ts');
    expect(fix(directory).out).toContain('readonly-types: 0 fixes applied, 2 left');
    expect(read(directory, 'src/cart.ts')).toBe(before);
  });

  test('--dry-run writes nothing', () => {
    const directory = project();
    const { out } = fix(directory, '--dry-run');
    expect(out[0]).toBe('readonly-types: 24 fixes would be applied, 2 left');
    expect(out.at(-1)).toBe('dry run: nothing written');
    expect(read(directory, 'src/cart.ts')).toBe(readFileSync(join(fixture, 'src/cart.ts'), 'utf8'));
  });

  test('--rule fixes one rule only', () => {
    const directory = project();
    expect(fix(directory, '--rule', 'no-type-predicate').out).toEqual([
      'no-type-predicate: 1 fix applied, 1 left',
      '  src/guards.ts:7:34 left as it is: the project does not compile with the fix',
      '1 file written',
    ]);
    expect(read(directory, 'src/cart.ts')).toBe(readFileSync(join(fixture, 'src/cart.ts'), 'utf8'));
  });

  test('says what it cannot do, with exit code 2', () => {
    const directory = project();
    expect(fix(directory, '--rule', 'no-throw').err[0]).toMatch(/^strict-ts-fix: no automatic fix for the rule no-throw \(readonly-types, no-type-predicate\)/);
    expect(fix(directory, '--force').code).toBe(2);
    expect(fix(directory, '-p', 'missing').err.join('\n')).toMatch(/missing does not exist$/);
  });
});

describe('the pieces', () => {
  const at = (start: number, end: number, text: string, rule = 'r'): Fix => ({ rule, file: 'a.ts', at: start, edits: [{ start, end, text }] });

  test('applyEdits keeps the offsets of the original text', () => {
    expect(applyEdits('abcdef', [at(0, 0, '<'), at(2, 4, 'XY'), at(6, 6, '>')])).toBe('<abXYef>');
  });

  test('applyEdits nests two insertions at the same place in the order they were asked', () => {
    const wrap: Fix = { rule: 'r', file: 'a.ts', at: 0, edits: [{ start: 0, end: 0, text: '(' }, { start: 3, end: 3, text: ')' }] };
    expect(applyEdits('abc', [at(0, 0, 'readonly '), wrap])).toBe('readonly (abc)');
  });

  test('keepWhatHolds drops exactly the fixes that break the build', () => {
    const fixes = [0, 1, 2, 3, 4, 5, 6].map((n) => at(n, n, String(n)));
    const bad = new Set([fixes[2], fixes[5]]);
    let builds = 0;
    const kept = keepWhatHolds(fixes, (candidates) => {
      builds++;
      return !candidates.some((candidate) => bad.has(candidate));
    });
    expect(kept.map((kept) => kept.at)).toEqual([0, 1, 3, 4, 6]);
    expect(builds).toBeLessThan(fixes.length * 2);
  });
});
