// The playground's scenarios, kept as whole projects: what the prototype accepted and refused is the reference.
import { describe, expect, test } from 'vitest';
import { defaultConfig } from '../src/index.js';
import { checkFiles, fixture, readProject, refusals } from './project.js';

const invoice = readProject(new URL('../../../examples/invoice/', import.meta.url));
const only = (files: Readonly<Record<string, string>>, prefix: string): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(files).filter(([name]) => name.startsWith(prefix)));

/** The `file:line rule` each `// expect: <rule>` comment of a project asks for. */
const expected = (files: Readonly<Record<string, string>>): readonly string[] =>
  Object.entries(files)
    .flatMap(([name, text]) =>
      text.split('\n').flatMap((line, index) => {
        const rules = /\/\/ expect: ([a-z, -]+)/.exec(line)?.[1]?.split(',') ?? [];
        return rules.map((rule) => `${name}:${index + 1} ${rule.trim()}`);
      }),
    )
    .toSorted();

describe('the invoice challenge', () => {
  test('the classic version is refused for each of its weaknesses', () => {
    const found = checkFiles(only(invoice, 'classic/'));
    expect(refusals(found)).toEqual([
      'no-external-import@3',
      'readonly-types@8',
      'readonly-types@9',
      'readonly-types@10',
      'readonly-types@14',
      'readonly-types@15',
      'readonly-types@16',
      'readonly-types@16',
      'readonly-types@17',
      'readonly-types@18',
      'no-null@18',
      'readonly-types@21',
      'no-throw@22',
      'no-throwing-call@23',
      'no-null@23',
      'no-cast@31',
      'no-any@31',
      'no-throwing-call@31',
      'no-non-null@35',
      'exhaustive-switch@39',
      'readonly-types@54',
      'must-use@56',
    ]);
  });

  test('the conforming version is accepted', () => {
    const config = { ...defaultConfig, unsafeDirs: ['strict/unsafe'] };
    expect(checkFiles(only(invoice, 'strict/'), { config })).toEqual([]);
  });

  test('the detailed version, validated by hand, is accepted', () => {
    expect(checkFiles(fixture('detailed'))).toEqual([]);
  });
});

describe('a conforming project', () => {
  test('is accepted', () => {
    expect(checkFiles(fixture('clean'))).toEqual([]);
  });

  test('its domain directory is pure', () => {
    const config = { ...defaultConfig, pureDirs: ['src/domain'] };
    expect(checkFiles(fixture('clean'), { config })).toEqual([]);
    const files = fixture('clean');
    const user = `${files['src/domain/user.ts']}\nexport const createdAt = (): number => Date.now();\n`;
    expect(refusals(checkFiles({ ...files, 'src/domain/user.ts': user }, { config }))).toEqual(['pure-domain@25']);
  });

  test('is refused as soon as a throw slips into its domain', () => {
    const files = fixture('clean');
    const user = `${files['src/domain/user.ts']}\nexport const fail = (): never => {\n  throw new Error("no");\n};\n`;
    expect(checkFiles({ ...files, 'src/domain/user.ts': user }).map((d) => `${d.file} ${d.rule}`)).toEqual([
      'src/domain/user.ts no-throw',
    ]);
  });
});

describe('one violation per rule', () => {
  const files = fixture('violations');
  const found = checkFiles(files, { compilerOptions: { noPropertyAccessFromIndexSignature: false } });

  test('every line marked `// expect:` is refused for its rule, and nothing else is', () => {
    const marked = found.filter((d) => d.rule !== 'no-ts-directive' && d.rule !== 'strict-compiler-options');
    const places = [...new Set(marked.map((d) => `${d.file}:${d.start.line} ${d.rule}`))].toSorted();
    expect(places).toEqual(expected(files));
  });

  test('the directive and the missing compiler option are refused too', () => {
    expect(found.filter((d) => d.rule === 'no-ts-directive').map((d) => `${d.file}:${d.start.line}`)).toEqual(['src/bad.ts:70']);
    expect(found.filter((d) => d.rule === 'strict-compiler-options').map((d) => d.message)).toEqual([
      'Required compiler options missing: noPropertyAccessFromIndexSignature.',
    ]);
  });

  test('every rule of the catalogue is triggered at least once', () => {
    expect([...new Set(found.map((d) => d.rule))].toSorted()).toEqual([
      'exhaustive-switch',
      'freeze-fresh',
      'must-use',
      'mut-exact',
      'mut-from-readonly',
      'no-ambient',
      'no-any',
      'no-cast',
      'no-class-lookalike',
      'no-early-read',
      'no-early-this',
      'no-external-import',
      'no-in-narrowing',
      'no-keyed-write',
      'no-loose-spread',
      'no-method-signature',
      'no-non-null',
      'no-null',
      'no-numeric-enum',
      'no-open-read',
      'no-overload',
      'no-param-mutation',
      'no-reject',
      'no-resize',
      'no-stale-narrowing',
      'no-throw',
      'no-throwing-call',
      'no-throwing-operator',
      'no-ts-directive',
      'no-type-predicate',
      'no-unbound-method',
      'no-unset-capture',
      'readonly-types',
      'safety-comment',
      'strict-compiler-options',
      'unsafe-boundary',
      'use-once',
    ]);
  });
});
