import { describe, expect, test } from 'vitest';
import { check, compareDiagnostics, type Config, defaultConfig, isUnsafe, locator, type Node, type Rule, rules, type TypeProvider } from '../src/index.js';
import { checkFiles, checkSafe, fixture, refusals } from './project.js';

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
    const left: Node = { kind: 'identifier', text: 'x', declaredOutside: false, parameter: 'none', declaredAt: undefined, isNarrowed: false, start: 0, end: 1, isUnit: false, children: [] };
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
      imports: {},
      compilerOptions: {},
      compilerDiagnostics: [],
      typeOf: () => expect.unreachable('the spy asks for no type'),
      exportsOf: () => [],
      calleeOf: () => undefined,
      isOwnModule: () => false,
      isWidened: () => false,
      isUnreadSource: () => false,
      unreadSources: [],
    };
    expect(check(provider, defaultConfig, [spy])).toEqual([]);
    expect(seen).toEqual(['file src/a.ts', 'null in binary']);
  });
});

describe('checking some files only', () => {
  const files = {
    ...fixture('violations'),
    'src/wrong.ts': 'export const n: number = "x";\nexport const m: string = 1;\n',
  };
  const compilerOptions = { noImplicitOverride: false };
  const whole = checkFiles(files, { compilerOptions });

  test('asked about every file, it gives exactly what a whole run gives', () => {
    expect(checkFiles(files, { compilerOptions, only: Object.keys(files) })).toEqual(whole);
  });

  test('asked about one file, it gives that file\'s share, and what belongs to no checked file', () => {
    const one = checkFiles(files, { compilerOptions, only: ['src/wrong.ts'] });
    const share = whole.filter((d) => d.file === 'src/wrong.ts' || d.file === 'tsconfig.json');
    expect(share.length).toBeGreaterThan(2);
    expect(one).toEqual(share);
  });

  test('the shares of each file add up to the whole', () => {
    const names = Object.keys(files);
    const shares = names.flatMap((name) => checkFiles(files, { compilerOptions, only: [name] }).filter((d) => d.file === name));
    const perFile = whole.filter((d) => names.includes(d.file));
    expect(shares.toSorted(compareDiagnostics)).toEqual(perFile);
  });
});

describe('the catalogue of rules', () => {
  test('holds the thirty-nine rules, each with a guarantee and a description', () => {
    expect(rules.map((rule) => rule.name).toSorted()).toEqual([
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
      'pure-domain',
      'readonly-types',
      'safety-comment',
      'strict-compiler-options',
      'unread-sources',
      'unsafe-boundary',
      'use-once',
    ]);
    for (const rule of rules) {
      expect(['typing', 'errors', 'mutability', 'ownership']).toContain(rule.guarantee);
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

describe('tests', () => {
  const body = 'import { helper } from "outside";\nexport const run = (text: string): unknown => { if (text === "") throw new Error("empty"); return helper(decodeURIComponent(text)) ?? null; };\n';
  const rulesOf = (file: string, config?: Config) => [...new Set(checkFiles({ [file]: body, 'node_modules/outside/index.d.ts': 'export declare const helper: (x: string) => unknown;\n' }, config === undefined ? {} : { config }).filter((d) => d.file === file).map((d) => d.rule))].toSorted();

  test('a test may throw, call what throws and import what it needs; the rest is checked as anywhere', () => {
    expect(rulesOf('src/run.ts')).toEqual(['no-external-import', 'no-null', 'no-throw', 'no-throwing-call']);
    expect(rulesOf('src/run.test.ts')).toEqual(['no-null']);
    expect(rulesOf('test/run.ts')).toEqual(['no-null']);
    expect(rulesOf('src/__tests__/run.ts')).toEqual(['no-null']);
    expect(rulesOf('src/run.spec.tsx')).toEqual(['no-null']);
  });

  test('the directories that hold tests are the project\'s to name', () => {
    const config = { ...defaultConfig, testDirs: ['checks'] };
    expect(rulesOf('checks/run.ts', config)).toEqual(['no-null']);
    expect(rulesOf('test/run.ts', config)).toEqual(['no-external-import', 'no-null', 'no-throw', 'no-throwing-call']);
  });
});
