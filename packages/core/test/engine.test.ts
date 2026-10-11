import { describe, expect, test } from 'vitest';
import { check, defaultConfig, isUnsafe, locator, type Node, type Rule, rules, type TypeProvider } from '../src/index.js';
import { checkFiles, checkSafe, refusals } from './project.js';

describe('check', () => {
  test("reports the compiler's own errors: strict-ts replaces tsc --noEmit", () => {
    const found = checkSafe('export const a: number = "x";\n');
    expect(refusals(found)).toEqual(['TS2322@1']);
    expect(found[0]?.file).toBe('src/a.ts');
  });

  test('gives each diagnostic its exact place', () => {
    const found = checkSafe('export const a = 1;\nexport const b = (x: unknown) => x as string;\n');
    expect(found).toEqual([
      {
        rule: 'no-cast',
        file: 'src/a.ts',
        start: { line: 2, column: 34 },
        end: { line: 2, column: 45 },
        message: '`as` cast forbidden.',
        help: 'Use a type guard, `satisfies`, or validate the data in unsafe/.',
      },
    ]);
  });

  test('sorts by file, then line, then column', () => {
    const files = {
      'src/b.ts': 'export const b = (x: unknown) => [x as string, x as number];\n',
      'src/a.ts': 'export const one = 1;\nexport const a = (x: unknown) => x as string;\n',
    };
    expect(checkFiles(files).map((d) => `${d.file}:${d.start.line}:${d.start.column}`)).toEqual([
      'src/a.ts:2:34',
      'src/b.ts:1:35',
      'src/b.ts:1:48',
    ]);
  });

  test('runs only the rules the configuration names', () => {
    const code = 'export const a = (x: unknown) => x as string;\nexport const b: string | null = null;\n';
    const config = { ...defaultConfig, rules: ['no-null'] };
    expect(refusals(checkSafe(code, { config }))).toEqual(['no-null@2', 'no-null@2']);
  });

  test('takes the unsafe directories from the configuration', () => {
    const code = 'import { ok } from "@strict-ts/std";\n// SAFETY: the caller checked it\nexport const f = (x: unknown) => ok(x as string);\n';
    const files = { 'lib/ffi/a.ts': code };
    expect(refusals(checkFiles(files))).toEqual(['no-cast@3']);
    expect(checkFiles(files, { config: { ...defaultConfig, unsafeDirs: ['./lib/ffi/'] } })).toEqual([]);
  });

  test('does not check the dependencies of the project', () => {
    // @strict-ts/std is compiled from its sources, which use `throw` and casts: it is outside the project root.
    const found = checkSafe('import { panic } from "@strict-ts/std";\nexport const stop = () => panic("stop");\n');
    expect(found).toEqual([]);
  });

  test('calls a rule on every node with its parent, and once per file', () => {
    const seen: string[] = [];
    const spy: Rule = {
      name: 'spy',
      guarantee: 'typing',
      description: 'Records what the engine shows it.',
      scope: 'all',
      file: ({ file }) => seen.push(`file ${file.name}`),
      visit: (node, _context, parent) => {
        if (node.kind === 'null-keyword') seen.push(`null in ${parent?.kind}`);
      },
    };
    const left: Node = { kind: 'identifier', text: 'x', declaredOutside: false, parameter: 'none', start: 0, end: 1, isUnit: false, children: [] };
    const provider: TypeProvider = {
      files: [
        {
          name: 'src/a.ts',
          text: 'x === null',
          root: {
            kind: 'binary',
            operator: '===',
            left,
            start: 0,
            end: 10,
            isUnit: false,
            children: [
              left,
              { kind: 'null-keyword', start: 6, end: 10, isUnit: false, children: [] },
            ],
          },
        },
      ],
      declarationFiles: [],
      compilerOptions: {},
      compilerDiagnostics: [],
      typeOf: () => expect.unreachable('the spy asks for no type'),
      exportsOf: () => [],
    };
    expect(check(provider, defaultConfig, [spy])).toEqual([]);
    expect(seen).toEqual(['file src/a.ts', 'null in binary']);
  });
});

describe('the catalogue of rules', () => {
  test('holds the sixteen rules, each with a guarantee and a description', () => {
    expect(rules.map((rule) => rule.name).toSorted()).toEqual([
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
      'readonly-types',
      'safety-comment',
      'strict-compiler-options',
      'unsafe-boundary',
    ]);
    for (const rule of rules) {
      expect(['typing', 'errors', 'mutability']).toContain(rule.guarantee);
      expect(rule.description.length).toBeGreaterThan(20);
    }
  });
});

describe('isUnsafe', () => {
  test('matches whole directories, however they are written', () => {
    const config = { ...defaultConfig, unsafeDirs: ['src/unsafe', './lib/ffi/', ''] };
    expect(isUnsafe('src/unsafe/http.ts', config)).toBe(true);
    expect(isUnsafe('lib/ffi/deep/a.ts', config)).toBe(true);
    expect(isUnsafe('src/unsafely/a.ts', config)).toBe(false);
    expect(isUnsafe('src/a.ts', config)).toBe(false);
  });
});

describe('locator', () => {
  test('turns offsets into 1-based lines and columns', () => {
    const locate = locator('ab\ncd\r\n\nef');
    expect(locate(0)).toEqual({ line: 1, column: 1 });
    expect(locate(2)).toEqual({ line: 1, column: 3 });
    expect(locate(3)).toEqual({ line: 2, column: 1 });
    expect(locate(7)).toEqual({ line: 3, column: 1 });
    expect(locate(9)).toEqual({ line: 4, column: 2 });
  });
});
