// The plugin must refuse what core refuses, at the same places: the two are compared on whole projects.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as gate } from '@strict-ts/cli';
import { afterAll, describe, expect, test } from 'vitest';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const plugin = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const oxlint = join(repo, 'node_modules/.bin/oxlint');
const RULES = ['no-throw', 'no-null', 'no-ts-directive'];
const scratch = mkdtempSync(join(tmpdir(), 'strict-ts-oxlint-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** What core refuses for the three rules, as `file:line:column rule`. */
function throughCore(project: string): readonly string[] {
  const out: string[] = [];
  gate(['--format', 'json', '--no-baseline'], { cwd: project, out: (line) => out.push(line), err: () => {} });
  const diagnostics: { rule: string; file: string; start: { line: number; column: number } }[] = JSON.parse(out.join('\n')).diagnostics;
  return diagnostics
    .filter((d) => RULES.includes(d.rule))
    .map((d) => `${d.file}:${d.start.line}:${d.start.column} ${d.rule}`)
    .toSorted();
}

/** What the plugin refuses on the same files, through Oxlint itself. */
function throughOxlint(project: string, files: readonly string[], unsafeDirs: readonly string[]): readonly string[] {
  const config = join(scratch, `${files.length}-${unsafeDirs.length}-${project.length}.json`);
  writeFileSync(
    config,
    JSON.stringify({
      jsPlugins: [plugin],
      categories: { correctness: 'off' },
      rules: {
        'strict-ts/no-throw': ['error', { unsafeDirs }],
        'strict-ts/no-null': ['error', { unsafeDirs }],
        'strict-ts/no-ts-directive': 'error',
      },
    }),
  );
  let output: string;
  try {
    output = execFileSync(oxlint, ['-c', config, '--format', 'json', ...files], { cwd: project, encoding: 'utf8' });
  } catch (failure) {
    // Oxlint exits with 1 when it reports errors: its report is still on the standard output.
    output = (failure as { stdout: string }).stdout;
  }
  const diagnostics: { code: string; filename: string; labels: { span: { line: number; column: number } }[] }[] = JSON.parse(output).diagnostics;
  return diagnostics
    .map((d) => `${d.filename}:${d.labels[0]?.span.line}:${d.labels[0]?.span.column} ${/\((.*)\)/.exec(d.code)?.[1]}`)
    .toSorted();
}

const projects: readonly { name: string; path: string; files: readonly string[]; unsafeDirs: readonly string[]; atLeast: number }[] = [
  { name: 'the classic invoice', path: 'examples/invoice/classic', files: ['invoice.ts'], unsafeDirs: ['src/unsafe'], atLeast: 3 },
  { name: 'the conforming invoice', path: 'examples/invoice/strict', files: ['invoice.ts', 'unsafe'], unsafeDirs: ['unsafe'], atLeast: 0 },
  { name: 'the standard library', path: 'packages/std', files: ['src'], unsafeDirs: [], atLeast: 3 },
  { name: 'the command line', path: 'packages/cli', files: ['src'], unsafeDirs: ['src/unsafe'], atLeast: 0 },
  { name: 'the legacy fixture', path: 'packages/cli/test/fixtures/legacy', files: ['src'], unsafeDirs: ['src/unsafe'], atLeast: 1 },
  { name: 'the codemod fixture', path: 'packages/codemod/test/fixtures/app', files: ['src'], unsafeDirs: ['src/unsafe'], atLeast: 0 },
];

describe('the same diagnostics as core, through Oxlint', () => {
  test.each(projects)('$name', ({ path, files, unsafeDirs, atLeast }) => {
    const core = throughCore(join(repo, path));
    expect(core.length).toBeGreaterThanOrEqual(atLeast);
    expect(throughOxlint(join(repo, path), files, unsafeDirs)).toEqual(core);
  });
});

describe('each rule, on a file of its own', () => {
  const directory = join(scratch, 'single');
  const lint = (text: string, unsafeDirs: readonly string[] = ['src/unsafe'], file = 'src/a.ts'): readonly string[] => {
    rmSync(directory, { recursive: true, force: true });
    execFileSync('mkdir', ['-p', join(directory, 'src/unsafe')]);
    writeFileSync(join(directory, file), text);
    return throughOxlint(directory, ['src'], unsafeDirs);
  };

  test('no-null: a value, a type, and the comparisons that stay allowed', () => {
    const text = [
      'export const a: string | null = null;',
      'export const b = (x: unknown): boolean => x === null || null != x;',
      'export const c = (x?: string) => x ?? null;',
    ].join('\n');
    expect(lint(text)).toEqual(['src/a.ts:1:26 no-null', 'src/a.ts:1:33 no-null', 'src/a.ts:3:39 no-null']);
  });

  test('no-throw, and both rules are silent in an unsafe directory', () => {
    const text = 'export function f(): never {\n  throw new Error("x");\n}\nexport const n = null;\n';
    expect(lint(text)).toEqual(['src/a.ts:2:3 no-throw', 'src/a.ts:4:18 no-null']);
    expect(lint(text, ['src/unsafe'], 'src/unsafe/a.ts')).toEqual([]);
    expect(lint(text, ['src'])).toEqual([]);
  });

  test('no-ts-directive: every form, unsafe directories included', () => {
    const text = '// @ts-ignore\nexport const a = 1;\n/** @ts-expect-error */\nexport const b: number = "x";\n// we never write @ts-ignore\n';
    expect(lint(text)).toEqual(['src/a.ts:1:1 no-ts-directive', 'src/a.ts:3:1 no-ts-directive']);
    expect(lint(text, ['src/unsafe'], 'src/unsafe/a.ts')).toEqual(['src/unsafe/a.ts:1:1 no-ts-directive', 'src/unsafe/a.ts:3:1 no-ts-directive']);
  });
});

test('the plugin names itself and its three rules', async () => {
  const loaded = (await import(plugin)).default;
  expect(loaded.meta.name).toBe('strict-ts');
  expect(Object.keys(loaded.rules)).toEqual(RULES);
  expect(readFileSync(plugin, 'utf8')).toContain("from '@strict-ts/core'");
});
