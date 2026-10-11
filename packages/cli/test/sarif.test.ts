import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rules } from '@strict-ts/core';
import Ajv from 'ajv-draft-04';
import { afterEach, describe, expect, test } from 'vitest';
import { run, VERSION } from '../src/index.js';

const fixtures = fileURLToPath(new URL('fixtures/', import.meta.url));
const schema = JSON.parse(readFileSync(join(fixtures, 'sarif-schema-2.1.0.json'), 'utf8'));
// The formats the schema names (uri, date-time) are not checked: the log holds relative paths and no date.
const validate = new Ajv({ strict: false, validateFormats: false }).compile(schema);

const copies: string[] = [];
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

interface Result {
  ruleId: string;
  level: string;
  message: { text: string };
  baselineState?: string;
  properties?: { help: string };
  locations?: { physicalLocation: { artifactLocation: { uri: string }; region: Record<string, number> } }[];
}
const sarif = (cwd: string, ...argv: readonly string[]) => {
  const { code, out, err } = strictTs(cwd, '--format', 'sarif', ...argv);
  expect(err).toEqual([]);
  const log = JSON.parse(out.join('\n'));
  expect(validate(log), JSON.stringify(validate.errors)).toBe(true);
  const results: Result[] = log.runs[0].results;
  return { code, log, results };
};
const place = (result: Result): string => {
  const location = result.locations?.[0]?.physicalLocation;
  return `${location?.artifactLocation.uri}:${location?.region['startLine']}:${location?.region['startColumn']} ${result.ruleId}`;
};

describe('--format sarif', () => {
  test('the validator refuses a log that is not SARIF', () => {
    expect(validate({ version: '2.1.0' })).toBe(false);
    expect(validate({ version: '2.1.0', runs: [{ tool: { driver: {} } }] })).toBe(false);
  });

  test('a conforming project gives a valid log with 0 results, exit code 0', () => {
    const { code, log, results } = sarif(project('conforming'));
    expect(code).toBe(0);
    expect(results).toEqual([]);
    expect(log.version).toBe('2.1.0');
    expect(log.runs).toHaveLength(1);
  });

  test('a project with violations gives a valid log with one result each, exit code 1', () => {
    const { code, results } = sarif(project('legacy'));
    expect(code).toBe(1);
    expect(results).toHaveLength(4);
    expect(results.every((result) => result.level === 'error' && result.baselineState === undefined)).toBe(true);
  });

  test('the tool describes itself and the rules that ran', () => {
    const driver = sarif(project('legacy')).log.runs[0].tool.driver;
    expect(driver.name).toBe('strict-ts');
    expect(driver.version).toBe(VERSION);
    expect(driver.rules.map((rule: { id: string }) => rule.id)).toEqual(rules.map((rule) => rule.name));
    expect(driver.rules[0]).toEqual({
      id: 'no-any',
      shortDescription: { text: 'Forbids `any`, written or inferred (JSON.parse for instance), outside unsafe/.' },
      properties: { guarantee: 'typing', scope: 'safe' },
    });
  });

  test('only the enabled rules are described', () => {
    const legacy = project('legacy');
    writeFileSync(join(legacy, 'strict-ts.json'), '{ "rules": ["no-cast", "no-throw"] }');
    const { log, results } = sarif(legacy);
    expect(log.runs[0].tool.driver.rules.map((rule: { id: string }) => rule.id)).toEqual(['no-cast', 'no-throw']);
    expect(results.map((result) => result.ruleId)).toEqual(['no-throw', 'no-cast']);
  });

  test('each diagnostic of the text output has exactly one result, with the same rule, file, line and column', () => {
    const legacy = project('legacy');
    const text = strictTs(legacy)
      .out.filter((line) => line.startsWith('src/'))
      .map((line) => line.split(' ').slice(0, 2).join(' '));
    expect(text).toHaveLength(4);
    expect(sarif(legacy).results.map(place)).toEqual(text);
  });

  test('a result carries the span, the message and the help', () => {
    const [first] = sarif(project('legacy')).results;
    expect(first).toEqual({
      ruleId: 'no-non-null',
      level: 'error',
      message: { text: '`!` assertion forbidden.' },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: 'src/billing.ts' },
            region: { startLine: 2, startColumn: 68, endLine: 2, endColumn: 79 },
          },
        },
      ],
      properties: { help: 'Handle the `undefined` case explicitly, or return an Option.' },
    });
  });

  test('with a baseline, old violations are notes marked unchanged and new ones errors marked new', () => {
    const legacy = project('legacy');
    strictTs(legacy, '--update-baseline');
    writeFileSync(join(legacy, 'src/new.ts'), 'export const nothing = null;\n');
    const { code, results } = sarif(legacy);
    expect(code).toBe(1);
    expect(results.map((result) => `${result.ruleId} ${result.level} ${result.baselineState}`)).toEqual([
      'no-non-null note unchanged',
      'no-null error new',
      'no-any note unchanged',
      'no-throw note unchanged',
      'no-cast note unchanged',
    ]);
  });

  test('a compiler error and a project-wide diagnostic are results too', () => {
    const legacy = project('legacy');
    writeFileSync(join(legacy, 'src/clean.ts'), 'export const double = (n: number): string => n * 2;\n');
    const tsconfig = JSON.parse(readFileSync(join(legacy, 'tsconfig.json'), 'utf8'));
    tsconfig.compilerOptions.noImplicitReturns = false;
    writeFileSync(join(legacy, 'tsconfig.json'), JSON.stringify(tsconfig));
    const { results } = sarif(legacy);
    expect(results.map(place)).toContain('src/clean.ts:1:46 TS2322');
    expect(results.map(place)).toContain('tsconfig.json:1:1 strict-compiler-options');
  });
});

describe('--output', () => {
  test('writes the log to the file, and nothing on the standard output', () => {
    const legacy = project('legacy');
    expect(strictTs(legacy, '--format', 'sarif', '--output', 'reports/out.sarif')).toEqual({ code: 1, out: [], err: [] });
    const log = JSON.parse(readFileSync(join(legacy, 'reports/out.sarif'), 'utf8'));
    expect(validate(log)).toBe(true);
    expect(log.runs[0].results).toHaveLength(4);
  });

  test('works for the text and json formats too', () => {
    const legacy = project('legacy');
    expect(strictTs(legacy, '--output', 'out.txt').out).toEqual([]);
    expect(readFileSync(join(legacy, 'out.txt'), 'utf8').trimEnd().split('\n').at(-1)).toBe('4 refused in 2 files');
    strictTs(legacy, '--format', 'json', '--output', 'out.json');
    expect(JSON.parse(readFileSync(join(legacy, 'out.json'), 'utf8')).diagnostics).toHaveLength(4);
  });

  test('a file that cannot be written means the project is not checked', () => {
    const legacy = project('legacy');
    const { code, out, err } = strictTs(legacy, '--format', 'sarif', '--output', 'tsconfig.json/out.sarif');
    expect(code).toBe(2);
    expect(out).toEqual([]);
    expect(err.join('\n')).toMatch(/^strict-ts: .*out\.sarif: /);
    expect(existsSync(join(legacy, 'tsconfig.json/out.sarif'))).toBe(false);
  });
});

test('the version is the one of package.json', () => {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
  expect(VERSION).toBe(manifest.version);
});
