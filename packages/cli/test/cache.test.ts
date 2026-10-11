import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { CACHE_FILE, fileKeys, parseCache, run } from '../src/index.js';

const fixtures = fileURLToPath(new URL('fixtures/', import.meta.url));
const copies: string[] = [];
function project(name = 'linked'): string {
  const directory = mkdtempSync(join(tmpdir(), 'strict-ts-cache-'));
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
/** A run with the cache: its report, and how many files it really checked. */
function cached(cwd: string, ...argv: readonly string[]) {
  const { code, out, err } = strictTs(cwd, '--cache', '--timing', ...argv);
  const timing = /^strict-ts: (\d+) of (\d+) files checked, (\d+) from the cache, \d+ ms$/.exec(err.at(-1) ?? '');
  return { code, out, checked: Number(timing?.[1]), reused: Number(timing?.[3]) };
}
/** The cache must never change a result: every cached run is compared with a run without it. */
function agrees(cwd: string, ...argv: readonly string[]) {
  const withCache = cached(cwd, ...argv);
  const without = strictTs(cwd, ...argv);
  expect({ code: withCache.code, out: withCache.out }).toEqual({ code: without.code, out: without.out });
  return withCache;
}
const edit = (cwd: string, file: string, change: (text: string) => string): void => {
  writeFileSync(join(cwd, file), change(readFileSync(join(cwd, file), 'utf8')));
};

describe('--cache', () => {
  test('a first run checks everything and records it; a second run checks nothing and says the same', () => {
    const directory = project();
    const cold = agrees(directory);
    expect(cold).toMatchObject({ code: 1, checked: 4, reused: 0 });
    expect(existsSync(join(directory, CACHE_FILE))).toBe(true);
    const warm = agrees(directory);
    expect(warm).toMatchObject({ code: 1, checked: 0, reused: 4 });
    expect(warm.out).toEqual(cold.out);
    expect(warm.out[0]).toBe('src/alone.ts:2:60 no-non-null `!` assertion forbidden.');
  });

  test('a changed file is checked again, alone when nothing imports it', () => {
    const directory = project();
    agrees(directory);
    edit(directory, 'src/alone.ts', () => 'export const first = (items: readonly string[]): string => items[0] ?? "";\n');
    expect(agrees(directory)).toMatchObject({ code: 0, out: [], checked: 1, reused: 3 });
  });

  test('a new violation in a changed file is found', () => {
    const directory = project();
    agrees(directory);
    edit(directory, 'src/total.ts', (text) => `${text}export const nothing = null;\n`);
    const after = agrees(directory);
    expect(after.out.filter((line) => line.startsWith('src/'))).toEqual([
      'src/alone.ts:2:60 no-non-null `!` assertion forbidden.',
      'src/total.ts:4:24 no-null `null` is forbidden.',
    ]);
    // total.ts changed, and report.ts imports it; model.ts and alone.ts did not move.
    expect(after).toMatchObject({ checked: 2, reused: 2 });
  });

  test('a change in a file is seen by the files that import it, directly or not', () => {
    const directory = project();
    agrees(directory);
    // The price becomes a string: total.ts, which adds prices, no longer compiles, though its text did not change.
    edit(directory, 'src/model.ts', (text) => text.replace('readonly price: number;', 'readonly price: string;').replace('): number => line.price', '): string => line.price'));
    const after = agrees(directory);
    expect(after).toMatchObject({ code: 1, checked: 3, reused: 1 });
    expect(after.out.some((line) => /^src\/total\.ts:3:\d+ TS\d+/.test(line))).toBe(true);
    expect(after.out.some((line) => /^src\/report\.ts:3:\d+ TS\d+/.test(line))).toBe(true);
  });

  test('fixing the dependency clears the errors of the files that import it', () => {
    const directory = project();
    const original = readFileSync(join(directory, 'src/model.ts'), 'utf8');
    edit(directory, 'src/model.ts', (text) => text.replace('readonly price: number;', 'readonly price: string;').replace('): number => line.price', '): string => line.price'));
    expect(agrees(directory).code).toBe(1);
    edit(directory, 'src/model.ts', () => original);
    const after = agrees(directory);
    expect(after.out.filter((line) => line.startsWith('src/'))).toEqual(['src/alone.ts:2:60 no-non-null `!` assertion forbidden.']);
  });

  test('a new file and a removed file are followed', () => {
    const directory = project();
    agrees(directory);
    writeFileSync(join(directory, 'src/new.ts'), 'export const nothing = null;\n');
    expect(agrees(directory)).toMatchObject({ checked: 1, reused: 4 });
    rmSync(join(directory, 'src/alone.ts'));
    const after = agrees(directory);
    expect(after.out.filter((line) => line.startsWith('src/'))).toEqual(['src/new.ts:1:24 no-null `null` is forbidden.']);
    expect(after).toMatchObject({ checked: 0, reused: 4 });
  });

  test('a change of configuration or of compiler options spares nothing', () => {
    const directory = project();
    agrees(directory);
    writeFileSync(join(directory, 'strict-ts.json'), '{ "rules": ["no-null"] }');
    expect(agrees(directory)).toMatchObject({ code: 0, out: [], checked: 4, reused: 0 });
    expect(agrees(directory)).toMatchObject({ checked: 0, reused: 4 });
    edit(directory, 'tsconfig.json', (text) => text.replace('"noImplicitOverride": true', '"noImplicitOverride": false'));
    expect(agrees(directory)).toMatchObject({ checked: 4, reused: 0 });
  });

  test('a file that declares globals counts with the environment: changing it spares nothing', () => {
    const directory = project();
    writeFileSync(join(directory, 'src/globals.ts'), 'var injected = 1;\n');
    agrees(directory);
    expect(agrees(directory)).toMatchObject({ checked: 0, reused: 5 });
    writeFileSync(join(directory, 'src/globals.ts'), 'var injected = "one";\n');
    expect(agrees(directory)).toMatchObject({ checked: 5, reused: 0 });
  });

  test('a cache that is not understood is no cache', () => {
    const directory = project();
    agrees(directory);
    for (const content of ['not json', '{ "version": 2 }', '{ "version": 1, "environment": "x", "files": { "src/alone.ts": 3 } }']) {
      writeFileSync(join(directory, CACHE_FILE), content);
      expect(agrees(directory)).toMatchObject({ code: 1, checked: 4, reused: 0 });
    }
  });

  test('the baseline and the formats work the same with it', () => {
    const directory = project();
    strictTs(directory, '--update-baseline');
    expect(agrees(directory).out).toEqual(['0 new, 1 baselined, 0 stale, 0 files out of the baseline']);
    expect(agrees(directory).out).toEqual(['0 new, 1 baselined, 0 stale, 0 files out of the baseline']);
    const json = cached(directory, '--format', 'json', '--no-baseline');
    expect(JSON.parse(json.out.join('\n')).diagnostics).toHaveLength(1);
    expect(json.reused).toBe(4);
  });

  test('without --cache nothing is read or written', () => {
    const directory = project();
    strictTs(directory);
    expect(existsSync(join(directory, CACHE_FILE))).toBe(false);
  });
});

describe('the pieces', () => {
  const hash = (text: string): string => `<${text}>`;

  test("a file's key holds its own text and the text of everything it imports, directly or not", () => {
    const files = {
      a: { hash: '1', imports: ['b'] },
      b: { hash: '2', imports: ['c'] },
      c: { hash: '3', imports: [] },
      d: { hash: '4', imports: [] },
    };
    expect(fileKeys(files, hash)).toEqual({ a: '<a:1\nb:2\nc:3>', b: '<b:2\nc:3>', c: '<c:3>', d: '<d:4>' });
  });

  test('files that import each other get a key each, and it ends', () => {
    const files = { a: { hash: '1', imports: ['b'] }, b: { hash: '2', imports: ['a'] } };
    expect(fileKeys(files, hash)).toEqual({ a: '<a:1\nb:2>', b: '<a:1\nb:2>' });
  });

  test('parseCache refuses what is not whole', () => {
    expect(parseCache(undefined)).toBeUndefined();
    expect(parseCache({ version: 1, environment: 'e', files: [] })).toBeUndefined();
    expect(parseCache({ version: 1, environment: 'e', files: { a: { key: 'k', diagnostics: [{ rule: 'r' }] } } })).toEqual({
      version: 1,
      environment: 'e',
      files: { a: { key: 'k', diagnostics: [] } },
    });
  });
});
