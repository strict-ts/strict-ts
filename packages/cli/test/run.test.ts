import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { run } from '../src/index.js';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const fixtures = fileURLToPath(new URL('fixtures/', import.meta.url));

function strictTs(argv: readonly string[], cwd: string = repo) {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(argv, { cwd, out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out, err };
}

const refusedInClassic = [
  'invoice.ts:3:28 no-external-import',
  'invoice.ts:18:18 no-null',
  'invoice.ts:22:27 no-throw',
  'invoice.ts:23:72 no-null',
  'invoice.ts:31:10 no-cast',
  'invoice.ts:31:10 no-any',
  'invoice.ts:35:10 no-non-null',
  'invoice.ts:39:11 exhaustive-switch',
  'invoice.ts:56:36 must-use',
];

describe('the gate', () => {
  test('passes conforming code: exit code 0 and nothing reported', () => {
    expect(strictTs(['-p', 'examples/invoice/strict'])).toEqual({ code: 0, out: [], err: [] });
  });

  test('refuses: exit code 1 and each violation with file, line, column and rule', () => {
    const { code, out, err } = strictTs(['--project', 'examples/invoice/classic']);
    expect(code).toBe(1);
    expect(err).toEqual([]);
    const violations = out.filter((line) => line.startsWith('invoice.ts:'));
    expect(violations.map((line) => line.split(' ').slice(0, 2).join(' '))).toEqual(refusedInClassic);
    expect(out[0]).toBe('invoice.ts:3:28 no-external-import External import "node:crypto" forbidden outside unsafe/.');
    expect(out[1]).toBe('  help: Wrap this dependency in unsafe/ and expose functions that return Result/Option.');
    expect(out.at(-1)).toBe('9 refused in 1 file');
  });

  test('--format json prints one JSON document with the same violations', () => {
    const { code, out, err } = strictTs(['-p', 'examples/invoice/classic', '--format', 'json']);
    expect(code).toBe(1);
    expect(err).toEqual([]);
    expect(out).toHaveLength(1);
    const document = JSON.parse(out[0] ?? '');
    expect(document.diagnostics.map((d: any) => `${d.file}:${d.start.line}:${d.start.column} ${d.rule}`)).toEqual(refusedInClassic);
    expect(document.diagnostics[0]).toEqual({
      rule: 'no-external-import',
      file: 'invoice.ts',
      start: { line: 3, column: 28 },
      end: { line: 3, column: 41 },
      message: 'External import "node:crypto" forbidden outside unsafe/.',
      help: 'Wrap this dependency in unsafe/ and expose functions that return Result/Option.',
    });
  });

  test('--format json prints an empty list for conforming code', () => {
    const { code, out } = strictTs(['-p', 'examples/invoice/strict', '--format=json']);
    expect(code).toBe(0);
    expect(JSON.parse(out.join('\n'))).toEqual({ diagnostics: [] });
  });

  test('checks the current directory by default, and accepts the path of a tsconfig.json', () => {
    expect(strictTs([], `${repo}examples/invoice/strict`).code).toBe(0);
    expect(strictTs(['-p', 'tsconfig.json'], `${repo}examples/invoice/classic`).code).toBe(1);
  });

  test('reads unsafeDirs and rules from strict-ts.json', () => {
    const { code, out } = strictTs(['-p', 'custom'], fixtures);
    expect(code).toBe(1);
    expect(out).toEqual([
      'lib/safe.ts:1:24 no-null `null` is forbidden.',
      '  help: Use Option<T> (or `undefined` for an optional property).',
      '',
      '1 refused in 1 file',
    ]);
  });
});

describe('a project that cannot be checked is not reported as safe', () => {
  const unchecked = (argv: readonly string[]) => {
    const { code, out, err } = strictTs(argv, fixtures);
    expect(out).toEqual([]);
    expect(code).toBe(2);
    return err.join('\n');
  };

  test('unknown argument', () => {
    expect(unchecked(['--fix'])).toMatch(/^strict-ts: unknown argument: --fix\n\nUsage: strict-ts/);
    expect(unchecked(['src'])).toContain('unknown argument: src');
  });

  test('option without a value, unknown format', () => {
    expect(unchecked(['--project'])).toContain('--project needs a value');
    expect(unchecked(['--format', 'sarif'])).toContain('unknown format: sarif (text or json)');
  });

  test('no project at that path', () => {
    expect(unchecked(['-p', 'nowhere'])).toMatch(/nowhere does not exist$/);
    expect(unchecked(['-p', '.'])).toMatch(/tsconfig\.json does not exist$/);
  });

  test('a tsconfig.json that cannot be read', () => {
    expect(unchecked(['-p', 'broken-tsconfig'])).toMatch(/^strict-ts: .*broken-tsconfig\/tsconfig\.json: /);
  });

  test('a project without a file', () => {
    expect(unchecked(['-p', 'no-file'])).toMatch(/^strict-ts: .*no-file\/tsconfig\.json: /);
  });

  test('a solution file that only references other projects', () => {
    const { code, err } = strictTs([]);
    expect(code).toBe(2);
    expect(err).toEqual([`strict-ts: no file to check under ${repo.replace(/\/$/, '')}`]);
  });

  test('a strict-ts.json that is not JSON, or has an unknown key or rule', () => {
    expect(unchecked(['-p', 'not-json'])).toMatch(/^strict-ts: .*not-json\/strict-ts\.json: /);
    expect(unchecked(['-p', 'unknown-key'])).toBe(
      'strict-ts: strict-ts.json: unknown key "unsafeDir" (unsafeDirs, allowedImports, rules, baseline)',
    );
    expect(unchecked(['-p', 'unknown-rule'])).toBe('strict-ts: strict-ts.json: unknown rule "no-cats"');
  });
});

test('--help prints the usage and exits with 0', () => {
  const { code, out, err } = strictTs(['--help']);
  expect(code).toBe(0);
  expect(err).toEqual([]);
  expect(out.join('\n')).toMatch(/^Usage: strict-ts \[options\]/);
});
