import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Diagnostic } from '@strict-ts/core';
import { afterEach, describe, expect, test } from 'vitest';
import { run, serializeBaseline, toBaseline } from '../src/index.js';

const fixtures = fileURLToPath(new URL('fixtures/', import.meta.url));
const copies: string[] = [];

/** A copy of a fixture project that a test may write into. */
function project(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'strict-ts-'));
  copies.push(directory);
  cpSync(join(fixtures, name), directory, { recursive: true });
  return directory;
}
afterEach(() => {
  for (const directory of copies.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function strictTs(cwd: string, ...argv: readonly string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(argv, { cwd, out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out, err };
}
const read = (directory: string, name = 'strict-ts-baseline.json') => readFileSync(join(directory, name), 'utf8');

describe('--update-baseline', () => {
  test('records the violations of a project: 4 in 2 files, a count per rule per file', () => {
    const legacy = project('legacy');
    expect(strictTs(legacy, '--update-baseline')).toEqual({
      code: 0,
      out: ['strict-ts-baseline.json: 4 recorded in 2 files'],
      err: [],
    });
    expect(read(legacy)).toBe(
      [
        '{',
        '  "version": 1,',
        '  "files": {',
        '    "src/billing.ts": {',
        '      "no-non-null": 1',
        '    },',
        '    "src/orders.ts": {',
        '      "no-any": 1,',
        '      "no-cast": 1,',
        '      "no-throw": 1',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  test('writes the same bytes when nothing changed', () => {
    const legacy = project('legacy');
    strictTs(legacy, '--update-baseline');
    const first = read(legacy);
    expect(strictTs(legacy, '--update-baseline').code).toBe(0);
    expect(read(legacy)).toBe(first);
  });

  test('writes an empty record for a conforming project', () => {
    const conforming = project('conforming');
    expect(strictTs(conforming, '--update-baseline')).toEqual({
      code: 0,
      out: ['strict-ts-baseline.json: 0 recorded in 0 files'],
      err: [],
    });
    expect(JSON.parse(read(conforming))).toEqual({ version: 1, files: {} });
  });

  test('replaces a baseline that no longer matches', () => {
    const legacy = project('legacy');
    strictTs(legacy, '--update-baseline');
    writeFileSync(join(legacy, 'src/billing.ts'), 'export const firstAmount = (amounts: readonly number[]) => amounts[0] ?? 0;\n');
    expect(strictTs(legacy, '--update-baseline').out).toEqual(['strict-ts-baseline.json: 3 recorded in 1 file']);
    expect(Object.keys(JSON.parse(read(legacy)).files)).toEqual(['src/orders.ts']);
  });

  test('writes where the `baseline` key of strict-ts.json says, creating the directory', () => {
    const legacy = project('legacy');
    writeFileSync(join(legacy, 'strict-ts.json'), '{ "baseline": "ci/baseline.json" }');
    expect(strictTs(legacy, '--update-baseline').out).toEqual(['ci/baseline.json: 4 recorded in 2 files']);
    expect(JSON.parse(read(legacy, 'ci/baseline.json')).version).toBe(1);
    expect(existsSync(join(legacy, 'strict-ts-baseline.json'))).toBe(false);
  });

  test('works from another directory with -p', () => {
    const legacy = project('legacy');
    expect(strictTs(tmpdir(), '--update-baseline', '-p', legacy).code).toBe(0);
    expect(existsSync(join(legacy, 'strict-ts-baseline.json'))).toBe(true);
  });

  test("does not record the compiler's own errors, and still refuses them", () => {
    const legacy = project('legacy');
    writeFileSync(join(legacy, 'src/clean.ts'), 'export const double = (n: number): string => n * 2;\n');
    const { code, out } = strictTs(legacy, '--update-baseline');
    expect(code).toBe(1);
    expect(out).toEqual([
      'strict-ts-baseline.json: 4 recorded in 2 files',
      '',
      "src/clean.ts:1:46 TS2322 Type 'number' is not assignable to type 'string'.",
      '',
      '1 refused in 1 file',
      'not recorded: a baseline holds rule violations only, not compiler errors',
    ]);
    expect(Object.keys(JSON.parse(read(legacy)).files)).toEqual(['src/billing.ts', 'src/orders.ts']);
  });

  test('writes nothing when the project cannot be checked', () => {
    const legacy = project('legacy');
    writeFileSync(join(legacy, 'strict-ts.json'), '{ "rules": ["no-cats"] }');
    expect(strictTs(legacy, '--update-baseline').code).toBe(2);
    expect(existsSync(join(legacy, 'strict-ts-baseline.json'))).toBe(false);
  });

  test('the gate itself does not read the baseline yet: every violation is still refused', () => {
    const legacy = project('legacy');
    strictTs(legacy, '--update-baseline');
    const { code, out } = strictTs(legacy);
    expect(code).toBe(1);
    expect(out.at(-1)).toBe('4 refused in 2 files');
  });
});

describe('toBaseline', () => {
  const at = (file: string, rule: string): Diagnostic => ({
    rule,
    file,
    start: { line: 1, column: 1 },
    end: { line: 1, column: 2 },
    message: '',
  });

  test('sorts files and rules, whatever the order of the diagnostics', () => {
    const found = [at('src/b.ts', 'no-throw'), at('src/a.ts', 'no-cast'), at('src/b.ts', 'no-any'), at('src/b.ts', 'no-throw')];
    const baseline = toBaseline(found);
    expect(baseline).toEqual({ version: 1, files: { 'src/a.ts': { 'no-cast': 1 }, 'src/b.ts': { 'no-any': 1, 'no-throw': 2 } } });
    expect(serializeBaseline(baseline)).toBe(serializeBaseline(toBaseline(found.toReversed())));
    expect(Object.keys(baseline.files)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(Object.keys(baseline.files['src/b.ts'] ?? {})).toEqual(['no-any', 'no-throw']);
  });

  test('records the project-wide rule under tsconfig.json, and leaves out compiler errors', () => {
    const found = [at('tsconfig.json', 'strict-compiler-options'), at('src/a.ts', 'TS2322'), at('', 'TS5023')];
    expect(toBaseline(found).files).toEqual({ 'tsconfig.json': { 'strict-compiler-options': 1 } });
  });
});
