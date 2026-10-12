import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as gate } from '@strict-ts/cli';
import { afterEach, describe, expect, test } from 'vitest';
import { applyEdits, type Fix, keepUnblamed, keepWhatHolds, placesAfter, run, type Trial } from '../src/index.js';

const fixture = fileURLToPath(new URL('fixtures/app/', import.meta.url));
const copies: string[] = [];
function project(fixture = 'app'): string {
  const directory = mkdtempSync(join(tmpdir(), 'strict-ts-fix-'));
  copies.push(directory);
  cpSync(fileURLToPath(new URL(`fixtures/${fixture}/`, import.meta.url)), directory, { recursive: true });
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
        '  src/mutated.ts:3:3 left as it is: with the fix the project does not compile, or is refused for more',
        '  src/mutated.ts:12:15 left as it is: with the fix the project does not compile, or is refused for more',
        'no-type-predicate: 1 fix applied, 1 left',
        '  src/guards.ts:7:34 left as it is: with the fix the project does not compile, or is refused for more',
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
      '  src/guards.ts:7:34 left as it is: with the fix the project does not compile, or is refused for more',
      '1 file written',
    ]);
    expect(read(directory, 'src/cart.ts')).toBe(readFileSync(join(fixture, 'src/cart.ts'), 'utf8'));
  });

  test('says what it cannot do, with exit code 2', () => {
    const directory = project();
    expect(fix(directory, '--rule', 'no-throw').err[0]).toMatch(/^strict-ts-fix: no automatic fix for the rule no-throw \(readonly-types, no-type-predicate, no-param-mutation\)/);
    expect(fix(directory, '--force').code).toBe(2);
    expect(fix(directory, '-p', 'missing').err.join('\n')).toMatch(/missing does not exist$/);
  });
});

describe('the fix at fault is not where the error is', () => {
  test('each fix that fails is found, and no other is dropped', () => {
    const directory = project('flows');
    expect(fix(directory).out).toEqual([
      'readonly-types: 12 fixes applied, 10 left',
      // `loadout[slot] = id` writes to both names of the key, and not to `label`.
      '  src/flows.ts:5:3 left as it is: with the fix the project does not compile, or is refused for more',
      '  src/flows.ts:6:3 left as it is: with the fix the project does not compile, or is refused for more',
      // The alias whose map is filled elsewhere: the map stays, the lists in it are fixed.
      '  src/flows.ts:15:21 left as it is: with the fix the project does not compile, or is refused for more',
      // What `names` returns is sorted in place by a caller that wrote no type.
      '  src/flows.ts:21:26 left as it is: with the fix the project does not compile, or is refused for more',
      // `[] as number[]`, pushed into through the object that holds it.
      '  src/flows.ts:31:37 left as it is: with the fix the project does not compile, or is refused for more',
      // The member behind `Data['rows']`.
      '  src/flows.ts:37:28 left as it is: with the fix the project does not compile, or is refused for more',
      // `target` is pushed into, and `made` only fails because it is given to it.
      '  src/flows.ts:45:30 left as it is: with the fix the project does not compile, or is refused for more',
      '  src/flows.ts:49:15 left as it is: with the fix the project does not compile, or is refused for more',
      // `tally.counts[one.slot] += 1` writes to the record, whatever the key is read from.
      '  src/flows.ts:58:31 left as it is: with the fix the project does not compile, or is refused for more',
      // It compiles read-only, and `Array.isArray` then gives `any[]`: the gate would refuse an `any` it did not.
      '  src/flows.ts:64:41 left as it is: with the fix the project does not compile, or is refused for more',
      'no-type-predicate: 1 fix applied, 0 left',
      '1 file written',
    ]);
    const fixed = read(directory, 'src/flows.ts');
    expect(fixed).toContain('export function firstOf(value: string | string[]): string {');
    expect(fixed).toContain('readonly label: string;');
    expect(fixed).toContain('export type Store = Map<string, readonly number[]>;');
    expect(fixed).toContain('export function sorted(): readonly string[] {');
    expect(fixed).toContain('export function make(): readonly number[] {');
    // The predicate is gone, and with it the object type that a fix was to be written in.
    expect(fixed).toContain('values.filter((value) => typeof value === "object");');
    expect(fixed).toContain('export function count(tally: Tally, seen: readonly { readonly slot: Slot }[]): void {');
    // A second run finds nothing more to do, and the same ten places left.
    const again = fix(directory).out;
    expect(again[0]).toBe('readonly-types: 0 fixes applied, 10 left');
    expect(again.slice(-2)).toEqual(['no-type-predicate: 0 fixes applied, 0 left', '0 files written']);
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

  test('applyEdits drops an edit inside what another one removes', () => {
    expect(applyEdits('f(x): x is { a: 1 } => x', [at(13, 13, 'readonly '), at(4, 19, '')])).toBe('f(x) => x');
  });

  test('placesAfter says where each fix is in the text as fixed', () => {
    const removed: Fix = { rule: 'r', file: 'a.ts', at: 6, edits: [{ start: 4, end: 18, text: '' }] };
    const fixes = [at(0, 0, 'readonly '), at(2, 3, 'XYZ'), removed, at(20, 20, '!')];
    // What a fix inserts at its own place does not move it; what is removed is found where the removal starts.
    expect(placesAfter(fixes).map((placed) => placed.at)).toEqual([0, 11, 15, 17]);
  });

  describe('keepUnblamed', () => {
    const fixes = Array.from({ length: 40 }, (_, n) => at(n, n, String(n)));
    const pick = (...numbers: readonly number[]): readonly Fix[] => numbers.flatMap((n) => fixes.slice(n, n + 1));
    /**
     * A project where each fix of `bad` causes one error. `hints` says what that error points at: the fix itself
     * when nothing is said, other fixes as well, or nothing at all.
     */
    const projectWith = (bad: readonly number[], hints: Readonly<Record<number, readonly number[]>> = {}, needs: Readonly<Record<number, number>> = {}) => {
      let builds = 0;
      const tryWith = (kept: readonly Fix[]): Trial => {
        builds++;
        const applied = new Set(kept.map((fix) => fix.at));
        const errors = [
          ...bad.filter((n) => applied.has(n)).map((n) => ({ where: `bad ${n}`, fixes: pick(...(hints[n] ?? [n])).filter((fix) => applied.has(fix.at)) })),
          // A fix that only holds when another one is applied.
          ...Object.entries(needs)
            .filter(([n, other]) => applied.has(Number(n)) && !applied.has(other))
            .map(([n]) => ({ where: `needs ${n}`, fixes: pick(Number(n)) })),
        ];
        return { holds: errors.length === 0, errors };
      };
      return { tryWith, builds: () => builds };
    };
    const numbers = (kept: readonly Fix[]): readonly number[] => kept.map((fix) => fix.at);
    const allBut = (...out: readonly number[]): readonly number[] => fixes.map((fix) => fix.at).filter((n) => !out.includes(n));

    test('a fix that an error names alone is dropped, in two compilations whatever their number', () => {
      const { tryWith, builds } = projectWith([2, 5, 11, 17, 23, 31]);
      expect(numbers(keepUnblamed(fixes, tryWith))).toEqual(allBut(2, 5, 11, 17, 23, 31));
      expect(builds()).toBe(2);
    });

    test('of the fixes an error names together, only the one at fault is dropped', () => {
      const { tryWith, builds } = projectWith([7, 30], { 7: [3, 4, 5, 6, 7, 8, 9, 10], 30: [29, 30] });
      expect(numbers(keepUnblamed(fixes, tryWith))).toEqual(allBut(7, 30));
      expect(builds()).toBeLessThan(10);
    });

    test('a fix that failed only because another one was out comes back', () => {
      // 12 is named together with 13, the one at fault; while 12 is out, 20 fails too, and holds once 12 is back.
      const { tryWith } = projectWith([13], { 13: [12, 13] }, { 20: 12 });
      expect(numbers(keepUnblamed(fixes, tryWith))).toEqual(allBut(13));
    });

    test('a fix that holds only with one that is at fault is dropped with it', () => {
      const { tryWith } = projectWith([12], {}, { 20: 12 });
      expect(numbers(keepUnblamed(fixes, tryWith))).toEqual(allBut(12, 20));
    });

    test('a chain of fixes that each need the next falls with its end, without a search', () => {
      // 30 is at fault and named with 31, which is not; 29 needs 30, 28 needs 29, 27 needs 28.
      const { tryWith, builds } = projectWith([30], { 30: [30, 31] }, { 29: 30, 28: 29, 27: 28 });
      expect(numbers(keepUnblamed(fixes, tryWith))).toEqual(allBut(27, 28, 29, 30));
      expect(builds()).toBeLessThan(20);
    });

    test('errors that point at nothing spell the fix that causes them', () => {
      const { tryWith, builds } = projectWith([9, 26, 33], { 9: [], 26: [], 33: [] });
      expect(numbers(keepUnblamed(fixes, tryWith))).toEqual(allBut(9, 26, 33));
      // Six compilations, one for each binary digit of 40, for the three errors together; the search by halves
      // would take some for each of them.
      expect(builds()).toBeLessThanOrEqual(12);
    });

    test('a hint that names the wrong fix costs compilations, never a wrong result', () => {
      const { tryWith } = projectWith([9, 26], { 9: [10], 26: [1, 2] });
      const kept = keepUnblamed(fixes, tryWith);
      expect(tryWith(kept).holds).toBe(true);
      expect(numbers(kept)).not.toContain(9);
      expect(numbers(kept)).not.toContain(26);
    });

    test('with nothing to fix or nothing at fault, one compilation', () => {
      const { tryWith, builds } = projectWith([]);
      expect(keepUnblamed(fixes, tryWith)).toEqual(fixes);
      expect(builds()).toBe(1);
    });
  });
});

describe('strict-ts-fix --rule no-param-mutation', () => {
  test('is not run unless it is named', () => {
    const directory = project('says');
    expect(fix(directory).out.join('\n')).not.toContain('no-param-mutation');
    expect(read(directory, 'src/counter.ts')).not.toContain('this: Mut');
  });

  test('writes `Mut<…>` on the methods, the parameters and the return types, up the calls, and says what it could not', () => {
    const directory = project('says');
    expect(refused(directory)).toEqual({ 'src/counter.ts no-param-mutation': 3, 'src/use.ts no-param-mutation': 1 });
    expect(fix(directory, '--rule', 'no-param-mutation')).toEqual({
      code: 0,
      out: [
        'no-param-mutation: 6 fixes applied, 1 left',
        '  src/counter.ts:20:5 left as it is: there is no written type to put `Mut<…>` around, or the function cannot declare `this`',
        '2 files written',
      ],
      err: [],
    });
    const counter = read(directory, 'src/counter.ts');
    expect(counter).toContain('increment(this: Mut<Counter>): void {');
    // It calls one that writes: found at the second look.
    expect(counter).toContain('twice(this: Mut<Counter>): void {');
    expect(counter).toContain('add(this: Mut<Counter>, step: number): void {');
    const use = read(directory, 'src/use.ts');
    expect(use).toContain("import { Counter } from './counter.js';\nimport type { Mut } from '@strict-ts/std';");
    expect(use).toContain('export const current = (): Mut<Counter> => held;');
    expect(use).toContain('export function touch(counter: Mut<Counter>): void {');
    expect(use).toContain('export const later = async (): Promise<Mut<Counter>> => held;');
    // A getter cannot declare `this`: it is the one place still refused.
    expect(refused(directory)).toEqual({ 'src/counter.ts no-param-mutation': 1 });
  });

  test('a second run has nothing more to write', () => {
    const directory = project('says');
    fix(directory, '--rule', 'no-param-mutation');
    const after = read(directory, 'src/use.ts');
    expect(fix(directory, '--rule', 'no-param-mutation').out).toEqual([
      'no-param-mutation: 0 fixes applied, 1 left',
      '  src/counter.ts:20:5 left as it is: with the fix the project does not compile, or is refused for more',
      '0 files written',
    ]);
    expect(read(directory, 'src/use.ts')).toBe(after);
  });
});
