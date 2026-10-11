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

});

describe('the gate against a baseline', () => {
  const recorded = (): string => {
    const legacy = project('legacy');
    strictTs(legacy, '--update-baseline');
    return legacy;
  };

  test('old violations pass: exit code 0, and the summary counts them', () => {
    expect(strictTs(recorded())).toEqual({ code: 0, out: ['0 new, 4 baselined, 0 stale, 0 files out of the baseline'], err: [] });
  });

  test('one more violation of a recorded rule in a recorded file fails, and names the allowance', () => {
    const legacy = recorded();
    writeFileSync(
      join(legacy, 'src/billing.ts'),
      'export const firstAmount = (amounts: readonly number[]): number => amounts[0]!;\nexport const last = (amounts: readonly number[]): number => amounts.at(-1)!;\n',
    );
    expect(strictTs(legacy)).toEqual({
      code: 1,
      out: [
        'src/billing.ts:1:68 no-non-null `!` assertion forbidden.',
        '  help: Handle the `undefined` case explicitly, or return an Option.',
        '  note: 1 allowed by the baseline',
        'src/billing.ts:2:61 no-non-null `!` assertion forbidden.',
        '  help: Handle the `undefined` case explicitly, or return an Option.',
        '  note: 1 allowed by the baseline',
        '',
        '2 refused in 1 file',
        '2 new, 3 baselined, 0 stale, 0 files out of the baseline',
      ],
      err: [],
    });
  });

  test('another rule in a recorded file has no allowance', () => {
    const legacy = recorded();
    writeFileSync(join(legacy, 'src/billing.ts'), 'export const firstAmount = (amounts: readonly number[]): number => amounts[0]!;\nexport const nothing = null;\n');
    const { code, out } = strictTs(legacy);
    expect(code).toBe(1);
    expect(out.filter((line) => line.startsWith('src/'))).toEqual(['src/billing.ts:2:24 no-null `null` is forbidden.']);
    expect(out.some((line) => line.includes('note:'))).toBe(false);
    expect(out.at(-1)).toBe('1 new, 4 baselined, 0 stale, 0 files out of the baseline');
  });

  test('a file outside the baseline has no allowance', () => {
    const legacy = recorded();
    writeFileSync(join(legacy, 'src/new.ts'), 'export const nothing = null;\n');
    const { code, out } = strictTs(legacy);
    expect(code).toBe(1);
    expect(out[0]).toBe('src/new.ts:1:24 no-null `null` is forbidden.');
    expect(out.at(-1)).toBe('1 new, 4 baselined, 0 stale, 0 files out of the baseline');
  });

  test('moving code inside a file changes nothing', () => {
    const legacy = recorded();
    const orders = readFileSync(join(legacy, 'src/orders.ts'), 'utf8');
    writeFileSync(join(legacy, 'src/orders.ts'), `\n\n// moved down\n${orders}`);
    expect(strictTs(legacy)).toEqual({ code: 0, out: ['0 new, 4 baselined, 0 stale, 0 files out of the baseline'], err: [] });
  });

  test("the compiler's errors are never allowed", () => {
    const legacy = recorded();
    writeFileSync(join(legacy, 'src/clean.ts'), 'export const double = (n: number): string => n * 2;\n');
    const { code, out } = strictTs(legacy);
    expect(code).toBe(1);
    expect(out[0]).toBe("src/clean.ts:1:46 TS2322 Type 'number' is not assignable to type 'string'.");
    expect(out.at(-1)).toBe('1 new, 4 baselined, 0 stale, 0 files out of the baseline');
  });

  test('--no-baseline shows everything', () => {
    const { code, out } = strictTs(recorded(), '--no-baseline');
    expect(code).toBe(1);
    expect(out.at(-1)).toBe('4 refused in 2 files');
  });

  test('--format json gives the refused diagnostics and the counts', () => {
    const legacy = recorded();
    writeFileSync(join(legacy, 'src/new.ts'), 'export const nothing = null;\n');
    const { code, out } = strictTs(legacy, '--format', 'json');
    const document = JSON.parse(out.join('\n'));
    expect(code).toBe(1);
    expect(document.diagnostics.map((d: { file: string; rule: string }) => `${d.file} ${d.rule}`)).toEqual(['src/new.ts no-null']);
    expect(document.baseline).toEqual({ new: 1, baselined: 4, stale: 0, migratedFiles: 0, staleEntries: [] });
  });

  test('without a baseline file nothing changes: every violation is refused, and no summary', () => {
    const { code, out } = strictTs(project('legacy'));
    expect(code).toBe(1);
    expect(out.at(-1)).toBe('4 refused in 2 files');
    expect(strictTs(project('conforming'))).toEqual({ code: 0, out: [], err: [] });
  });

  test('a baseline file that is not understood allows nothing: the project is not checked', () => {
    const broken = (content: string): string => {
      const legacy = project('legacy');
      writeFileSync(join(legacy, 'strict-ts-baseline.json'), content);
      const { code, out, err } = strictTs(legacy);
      expect(code).toBe(2);
      expect(out).toEqual([]);
      return err.join('\n');
    };
    expect(broken('{ "version": 2, "files": {} }')).toBe('strict-ts: strict-ts-baseline.json: "version": 1 expected');
    expect(broken('{ "version": 1 }')).toBe('strict-ts: strict-ts-baseline.json: "files": object expected');
    expect(broken('{ "version": 1, "files": { "src/a.ts": { "no-any": -1 } } }')).toBe(
      'strict-ts: strict-ts-baseline.json: "src/a.ts" "no-any": a positive whole number expected',
    );
    expect(broken('{ "version": 1, "files": { "src/a.ts": 3 } }')).toBe('strict-ts: strict-ts-baseline.json: "src/a.ts": object expected');
    expect(broken('not json')).toMatch(/strict-ts-baseline\.json: /);
  });
});

describe('a baseline can only shrink', () => {
  /** The legacy project recorded, then its one violation in billing.ts fixed. */
  const fixed = (): string => {
    const legacy = project('legacy');
    strictTs(legacy, '--update-baseline');
    writeFileSync(join(legacy, 'src/billing.ts'), 'export const firstAmount = (amounts: readonly number[]) => amounts[0] ?? 0;\n');
    return legacy;
  };

  test('a fix leaves a stale entry: a warning, and the exit code stays 0', () => {
    expect(strictTs(fixed())).toEqual({
      code: 0,
      out: [
        'warning: stale baseline entry src/billing.ts no-non-null: 1 recorded, 0 found',
        '  help: run --update-baseline, so that what was fixed cannot come back',
        '0 new, 3 baselined, 1 stale, 1 file out of the baseline',
      ],
      err: [],
    });
  });

  test('--strict-baseline fails on a stale entry', () => {
    const { code, out } = strictTs(fixed(), '--strict-baseline');
    expect(code).toBe(1);
    expect(out.at(-1)).toBe('0 new, 3 baselined, 1 stale, 1 file out of the baseline');
  });

  test('--strict-baseline passes when the baseline matches', () => {
    const legacy = project('legacy');
    strictTs(legacy, '--update-baseline');
    expect(strictTs(legacy, '--strict-baseline').code).toBe(0);
  });

  test('an entry partly fixed is stale, and its file is not out of the baseline', () => {
    const legacy = project('legacy');
    writeFileSync(
      join(legacy, 'strict-ts-baseline.json'),
      JSON.stringify({ version: 1, files: { 'src/orders.ts': { 'no-any': 3, 'no-cast': 1, 'no-throw': 1 }, 'src/billing.ts': { 'no-non-null': 1 } } }),
    );
    const { code, out } = strictTs(legacy);
    expect(code).toBe(0);
    expect(out).toEqual([
      'warning: stale baseline entry src/orders.ts no-any: 3 recorded, 1 found',
      '  help: run --update-baseline, so that what was fixed cannot come back',
      '0 new, 4 baselined, 1 stale, 0 files out of the baseline',
    ]);
  });

  test('updating the baseline clears the stale entry and drops the migrated file', () => {
    const legacy = fixed();
    strictTs(legacy, '--update-baseline');
    expect(strictTs(legacy, '--strict-baseline')).toEqual({
      code: 0,
      out: ['0 new, 3 baselined, 0 stale, 0 files out of the baseline'],
      err: [],
    });
  });

  test('--format json lists the stale entries', () => {
    const document = JSON.parse(strictTs(fixed(), '--format', 'json').out.join('\n'));
    expect(document).toEqual({
      diagnostics: [],
      baseline: {
        new: 0,
        baselined: 3,
        stale: 1,
        migratedFiles: 1,
        staleEntries: [{ file: 'src/billing.ts', rule: 'no-non-null', recorded: 1, found: 0 }],
      },
    });
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
