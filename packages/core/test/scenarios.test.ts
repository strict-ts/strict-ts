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
        const rule = /\/\/ expect: ([a-z-]+)/.exec(line)?.[1];
        return rule === undefined ? [] : [`${name}:${index + 1} ${rule}`];
      }),
    )
    .toSorted();

describe('the invoice challenge', () => {
  test('the classic version is refused for each of its weaknesses', () => {
    const found = checkFiles(only(invoice, 'classic/'));
    expect(refusals(found)).toEqual([
      'no-external-import@3',
      'no-null@18',
      'no-throw@22',
      'no-null@23',
      'no-cast@31',
      'no-any@31',
      'no-non-null@35',
      'exhaustive-switch@39',
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
      'must-use',
      'no-ambient',
      'no-any',
      'no-cast',
      'no-external-import',
      'no-non-null',
      'no-null',
      'no-param-mutation',
      'no-throw',
      'no-ts-directive',
      'no-type-predicate',
      'safety-comment',
      'strict-compiler-options',
      'unsafe-boundary',
    ]);
  });
});
