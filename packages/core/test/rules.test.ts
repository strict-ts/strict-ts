import { describe, expect, test } from 'vitest';
import { checkFiles, checkSafe, checkUnsafe, refusals } from './project.js';

describe('no-any', () => {
  test('refuses a written any', () => {
    const found = checkSafe('export const show = (x: any): string => String(x);\n');
    expect(refusals(found)).toEqual(['no-any@1']);
    expect(found[0]?.help).toBe('Use `unknown`, then narrow the type with a guard.');
  });

  test('refuses an inferred any where it enters', () => {
    const found = checkSafe('export const size = (text: string): string => String(JSON.parse(text));\n');
    expect(refusals(found)).toEqual(['no-any@1']);
    expect(found[0]?.message).toBe('This expression has type `any` (inferred).');
    expect(found[0]?.start.column).toBe('export const size = (text: string): string => String('.length + 1);
  });

  test('reports a chain of any once', () => {
    expect(refusals(checkSafe('export const deep: unknown = JSON.parse("{}").a.b[0];\n'))).toEqual(['no-any@1']);
  });

  test('accepts unknown narrowed with a guard', () => {
    const code = 'export const size = (x: unknown): number => (typeof x === "string" ? x.length : 0);\n';
    expect(checkSafe(code)).toEqual([]);
  });

  test('is allowed inside unsafe/', () => {
    const code = [
      'import { ok } from "@strict-ts/std";',
      '// SAFETY: only ever passed to String',
      'const raw: any = JSON.parse("1");',
      'export const read = () => ok(String(raw));',
    ].join('\n');
    expect(checkUnsafe(code)).toEqual([]);
  });
});

describe('no-cast', () => {
  test('refuses `as T`', () => {
    expect(refusals(checkSafe('export const name = (x: unknown): string => x as string;\n'))).toEqual(['no-cast@1']);
  });

  test('refuses `<T>x`', () => {
    const found = checkSafe('export const name = (x: unknown): string => <string>x;\n');
    expect(refusals(found)).toEqual(['no-cast@1']);
    expect(found[0]?.message).toBe('`<T>` cast forbidden.');
  });

  test('accepts `as const` and `satisfies`', () => {
    const code = [
      'export const roles = ["admin", "user"] as const;',
      'export const labels = { admin: "Admin", user: "User" } satisfies Record<(typeof roles)[number], string>;',
    ].join('\n');
    expect(checkSafe(code)).toEqual([]);
  });

  test('is allowed inside unsafe/', () => {
    const code = [
      'import { ok } from "@strict-ts/std";',
      '// SAFETY: the only caller passes a string',
      'export const name = (x: unknown) => ok(x as string);',
    ].join('\n');
    expect(checkUnsafe(code)).toEqual([]);
  });
});

describe('no-non-null', () => {
  test('refuses `x!`', () => {
    const found = checkSafe('export const first = (items: readonly string[]): string => items[0]!;\n');
    expect(refusals(found)).toEqual(['no-non-null@1']);
  });

  test('accepts an explicit fallback', () => {
    expect(checkSafe('export const first = (items: readonly string[]): string => items[0] ?? "";\n')).toEqual([]);
  });
});

describe('no-throw', () => {
  test('refuses throw in safe code', () => {
    const found = checkSafe('export function fail(): never {\n  throw new Error("boom");\n}\n');
    expect(refusals(found)).toEqual(['no-throw@2']);
  });

  test('accepts panic from the standard library', () => {
    const code = 'import { panic } from "@strict-ts/std";\nexport const fail = (): never => panic("boom");\n';
    expect(checkSafe(code)).toEqual([]);
  });

  test('is allowed inside unsafe/', () => {
    const code = [
      'import { attempt } from "@strict-ts/std";',
      'const risky = (): number => {',
      '  throw new Error("boom");',
      '};',
      'export const safe = () => attempt(risky, String);',
    ].join('\n');
    expect(checkUnsafe(code)).toEqual([]);
  });
});

describe('no-null', () => {
  test('refuses null as a type and as a value', () => {
    const found = checkSafe('export const nothing: string | null = null;\n');
    expect(refusals(found)).toEqual(['no-null@1', 'no-null@1']);
  });

  test('accepts a comparison with null, to narrow an unknown', () => {
    const code = [
      'export const isObject = (x: unknown): boolean => typeof x === "object" && x !== null;',
      'export const isNullish = (x: unknown): boolean => x == null || null === x;',
    ].join('\n');
    expect(checkSafe(code)).toEqual([]);
  });

  test('refuses null on the other side of an operator that is not a comparison', () => {
    expect(refusals(checkSafe('export const pick = (x?: string) => x ?? null;\n'))).toEqual(['no-null@1']);
  });
});

describe('no-external-import', () => {
  test('refuses a dependency imported in safe code', () => {
    const found = checkSafe('import { readFileSync } from "node:fs";\nexport const read = readFileSync;\n');
    expect(refusals(found)).toEqual(['no-external-import@1']);
    expect(found[0]?.message).toBe('External import "node:fs" forbidden outside unsafe/.');
  });

  test('refuses re-exports, dynamic imports, require and import types', () => {
    const code = [
      'export * from "node:crypto";',
      'export const lazy = (): Promise<unknown> => import("node:fs");',
      'declare const require: (name: string) => unknown;',
      'export const old = require("node:fs");',
      'export type Read = typeof import("node:fs").readFileSync;',
    ].join('\n');
    expect(refusals(checkSafe(code))).toEqual([
      'no-external-import@1',
      'no-external-import@2',
      'no-external-import@4',
      'no-external-import@5',
    ]);
  });

  test('accepts relative imports, the standard library and exports without a module', () => {
    const files = {
      'src/b.ts': 'export const b = 1;\n',
      'src/a.ts': 'import { ok } from "@strict-ts/std";\nimport { b } from "./b.js";\nconst c = ok(b);\nexport { c };\n',
    };
    expect(checkFiles(files)).toEqual([]);
  });

  test('accepts what the configuration allows, sub-paths included', () => {
    const code = 'import { readFileSync } from "node:fs";\nexport const read = readFileSync;\n';
    const config = { unsafeDirs: ['src/unsafe'], allowedImports: ['node:fs'] };
    expect(checkSafe(code, { config })).toEqual([]);
    expect(refusals(checkSafe(code, { config: { ...config, allowedImports: ['node'] } }))).toEqual(['no-external-import@1']);
  });

  test('is allowed inside unsafe/', () => {
    const code = [
      'import { readFileSync } from "node:fs";',
      'import { attempt } from "@strict-ts/std";',
      'export const read = (path: string) => attempt(() => readFileSync(path, "utf8"), String);',
    ].join('\n');
    expect(checkUnsafe(code)).toEqual([]);
  });
});

describe('must-use', () => {
  const declarations = [
    'import { err, ok, Option, type Result } from "@strict-ts/std";',
    'const divide = (a: number, b: number): Result<number, "div-by-zero"> => (b === 0 ? err("div-by-zero") : ok(a / b));',
    'const first = (items: readonly number[]) => Option.from(items[0]);',
    'const save = async (): Promise<void> => {};',
  ];
  const body = (...lines: readonly string[]): string =>
    [...declarations, 'export async function run(): Promise<void> {', ...lines, '}', ''].join('\n');

  test('refuses an ignored Result', () => {
    const found = checkSafe(body('  divide(1, 0);'));
    expect(refusals(found)).toEqual(['must-use@6']);
    expect(found[0]?.message).toBe('Result ignored: its possible error is lost.');
  });

  test('refuses an ignored Option', () => {
    const found = checkSafe(body('  first([]);'));
    expect(found.map((d) => d.message)).toEqual(['Option ignored.']);
  });

  test('refuses an ignored Promise', () => {
    const found = checkSafe(body('  save();'));
    expect(found.map((d) => d.message)).toEqual(['Promise ignored (neither awaited nor handled).']);
  });

  test('recognises a Result by its shape, whatever its name', () => {
    const code = [
      'type Outcome = { ok: true; value: number } | { ok: false; error: string };',
      'const compute = (): Outcome => ({ ok: true, value: 1 });',
      'export function run(): void {',
      '  compute();',
      '}',
    ].join('\n');
    expect(refusals(checkSafe(code))).toEqual(['must-use@4']);
  });

  test('accepts a value that is used, awaited or dropped with void', () => {
    const code = body(
      '  const half = divide(1, 2);',
      '  console.log(half.unwrapOr(0), first([1]).unwrapOr(0));',
      '  await save();',
      '  void save();',
      '  void divide(1, 0);',
    );
    expect(checkSafe(code)).toEqual([]);
  });

  test('refuses a value that is only sometimes a Promise, a Result or an Option', () => {
    const code = body(
      '  const maybe = [{ save }][1];',
      '  maybe?.save();',
      '  divide(1, 2).ok && save();',
      '  divide(1, 2).ok ? divide(1, 0) : undefined;',
      '  first([]).some || first([1]);',
    );
    expect(checkSafe(code).map((d) => `${d.start.line} ${d.message}`)).toEqual([
      '7 Promise ignored (neither awaited nor handled).',
      '8 Promise ignored (neither awaited nor handled).',
      '9 Result ignored: its possible error is lost.',
      '10 Option ignored.',
    ]);
  });

  test('accepts an assignment: the value is kept', () => {
    const code = body('  let half;', '  half = divide(1, 2);', '  let pending;', '  pending = save();', '  console.log(half.ok, await pending);');
    expect(checkSafe(code)).toEqual([]);
  });

  test('applies inside unsafe/ too', () => {
    const code = [
      'import { ok } from "@strict-ts/std";',
      'export const one = () => ok(1);',
      'one();',
    ].join('\n');
    expect(refusals(checkUnsafe(code))).toEqual(['must-use@3']);
  });
});

describe('exhaustive-switch', () => {
  const label = (...cases: readonly string[]): string =>
    [
      'type Status = "draft" | "sent" | "paid";',
      'export function label(status: Status): string {',
      '  switch (status) {',
      ...cases,
      '  }',
      '  return "";',
      '}',
      '',
    ].join('\n');

  test('names the members a switch on a union forgets', () => {
    const found = checkSafe(label('    case "draft":', '      return "Draft";'));
    expect(refusals(found)).toEqual(['exhaustive-switch@3']);
    expect(found[0]?.message).toBe('Non-exhaustive switch, missing cases: "sent", "paid".');
  });

  test('accepts a switch that covers every member', () => {
    const code = label('    case "draft":', '    case "sent":', '      return "Open";', '    case "paid":', '      return "Paid";');
    expect(checkSafe(code)).toEqual([]);
  });

  test('accepts a default', () => {
    expect(checkSafe(label('    case "draft":', '      return "Draft";', '    default:', '      return "Other";'))).toEqual([]);
  });

  test('refuses a switch on a type that is not finite without default', () => {
    const code = [
      'export function code(text: string): number {',
      '  switch (text) {',
      '    case "a":',
      '      return 1;',
      '  }',
      '  return 0;',
      '}',
    ].join('\n');
    const found = checkSafe(code);
    expect(found.map((d) => d.message)).toEqual(['switch on a non-finite type without `default`.']);
  });

  test('treats boolean and optional members as finite', () => {
    const code = [
      'export function show(flag: boolean | undefined): string {',
      '  switch (flag) {',
      '    case true:',
      '      return "yes";',
      '  }',
      '  return "";',
      '}',
    ].join('\n');
    expect(checkSafe(code).map((d) => d.message)).toEqual(['Non-exhaustive switch, missing cases: undefined, false.']);
  });
});

describe('no-ts-directive', () => {
  test('refuses @ts-ignore, @ts-expect-error and @ts-nocheck', () => {
    const code = [
      '// @ts-ignore',
      'export const a: number = 1;',
      '/* @ts-expect-error */',
      'export const b: number = "x";',
    ].join('\n');
    const found = checkSafe(code);
    expect(refusals(found)).toEqual(['no-ts-directive@1', 'no-ts-directive@3']);
    expect(found.map((d) => d.message)).toEqual(['@ts-ignore is forbidden.', '@ts-expect-error is forbidden.']);
    expect(refusals(checkSafe('// @ts-nocheck\nexport const c: number = "x";\n'))).toEqual(['no-ts-directive@1']);
  });

  test('refuses the block-comment forms the compiler also reads', () => {
    const hidden = (comment: string) => checkSafe(`${comment}\nexport const a: number = "x";\n`);
    expect(refusals(hidden('/** @ts-ignore */'))).toEqual(['no-ts-directive@1']);
    expect(refusals(hidden('/*\n * @ts-ignore */'))).toEqual(['no-ts-directive@2']);
    expect(refusals(hidden('/* why\n   @ts-expect-error */'))).toEqual(['no-ts-directive@2']);
    expect(refusals(hidden('/// @ts-ignore'))).toEqual(['no-ts-directive@1']);
  });

  test('accepts prose that names a directive', () => {
    expect(checkSafe('// we never write @ts-ignore here\nexport const a = 1;\n')).toEqual([]);
  });

  test('is refused inside unsafe/ too', () => {
    expect(refusals(checkUnsafe('// @ts-ignore\nexport const a = 1;\n'))).toEqual(['no-ts-directive@1']);
  });

  test('accepts a comment that only mentions typescript', () => {
    expect(checkSafe('// ts-ignore is forbidden here, see the README\nexport const a = 1;\n')).toEqual([]);
  });
});

describe('unsafe-boundary', () => {
  test('refuses an exported function that returns neither Result nor Option', () => {
    const code = 'import { readFileSync } from "node:fs";\nexport const read = (path: string): string => readFileSync(path, "utf8");\n';
    const found = checkUnsafe(code);
    expect(refusals(found)).toEqual(['unsafe-boundary@2']);
    expect(found[0]?.message).toBe('"read" leaves unsafe/ without Result/Option (returns string).');
    expect(found[0]?.start.column).toBe('export const '.length + 1);
  });

  test('refuses an export of type any', () => {
    const found = checkUnsafe('// SAFETY: none, this is the example\nexport const raw: any = JSON.parse("{}");\n');
    expect(found.map((d) => d.message)).toEqual(['The export "raw" has type `any`.']);
  });

  test('refuses a Result that carries any', () => {
    const code = 'import { ok } from "@strict-ts/std";\nexport const parse = (text: string) => ok(JSON.parse(text));\n';
    expect(checkUnsafe(code).map((d) => d.message)).toEqual(['"parse" returns a Result/Option that contains `any`.']);
  });

  test('looks through the promise of an async function', () => {
    const code = [
      'import { attempt } from "@strict-ts/std";',
      'export const load = (url: string) => attempt(() => fetch(url), String);',
      'export const status = async (url: string): Promise<number> => (await fetch(url)).status;',
    ].join('\n');
    expect(checkUnsafe(code).map((d) => d.message)).toEqual([
      '"status" leaves unsafe/ without Result/Option (returns number).',
    ]);
  });

  test('accepts Result, Option, constants and types', () => {
    const code = [
      'import { attempt, Option } from "@strict-ts/std";',
      'export type Env = Readonly<Record<string, string>>;',
      'export const retries = 3;',
      'export const readEnv = (name: string) => Option.from(process.env[name]);',
      'export const parse = (text: string) => attempt((): unknown => JSON.parse(text), String);',
    ].join('\n');
    expect(checkUnsafe(code)).toEqual([]);
  });

  test('reports a re-export on the line that re-exports it', () => {
    const files = {
      'src/unsafe/impl.ts': 'export const now = (): number => Date.now();\n',
      'src/unsafe/a.ts': '// the public face of unsafe/\nexport { now } from "./impl.js";\n',
    };
    expect(checkFiles(files).map((d) => `${d.file}:${d.start.line}`)).toEqual(['src/unsafe/a.ts:2', 'src/unsafe/impl.ts:1']);
  });

  test('does not apply to safe code', () => {
    expect(checkSafe('export const double = (n: number): number => n * 2;\n')).toEqual([]);
  });
});

describe('safety-comment', () => {
  const unsafe = (...lines: readonly string[]) => checkUnsafe(['import { ok } from "@strict-ts/std";', ...lines, ''].join('\n'));
  const cast = 'export const id = (raw: unknown) => ok(raw as string);';

  test('refuses a bare cast in unsafe/, and says what to write', () => {
    const found = unsafe(cast);
    expect(found).toEqual([
      {
        rule: 'safety-comment',
        file: 'src/unsafe/a.ts',
        start: { line: 2, column: 40 },
        end: { line: 2, column: 53 },
        message: 'Unchecked cast without a SAFETY comment.',
        help: 'Say why this holds on the line above: // SAFETY: <reason>',
      },
    ]);
  });

  test('accepts a cast with its reason on the line above', () => {
    expect(unsafe('// SAFETY: validated by the schema above', cast)).toEqual([]);
  });

  test('refuses a SAFETY comment without a reason', () => {
    expect(refusals(unsafe('// SAFETY:', cast))).toEqual(['safety-comment@3']);
    expect(refusals(unsafe('// SAFETY:   ', cast))).toEqual(['safety-comment@3']);
  });

  test('the comment must be adjacent: a statement or a blank line in between breaks it', () => {
    expect(refusals(unsafe('// SAFETY: validated', 'export const one = 1;', cast))).toEqual(['safety-comment@4']);
    expect(refusals(unsafe('// SAFETY: validated', '', cast))).toEqual(['safety-comment@4']);
  });

  test('reports nothing outside unsafe/: the typing rules already refuse it there', () => {
    const found = checkSafe(['import { ok } from "@strict-ts/std";', cast].join('\n'));
    expect(refusals(found)).toEqual(['no-cast@2']);
  });

  test('asks the same of any, of <T>x and of a non-null assertion', () => {
    const found = unsafe(
      'const loose: any = 1;',
      'export const first = (items: readonly string[]) => ok(items[0]!);',
      'export const name = (raw: unknown) => ok(<string>raw);',
      'void loose;',
    );
    expect(found.map((d) => `${d.start.line} ${d.message}`)).toEqual([
      '2 Unchecked `any` without a SAFETY comment.',
      '3 Unchecked `!` assertion without a SAFETY comment.',
      '4 Unchecked cast without a SAFETY comment.',
    ]);
  });

  test('one comment covers the whole statement below it, and other comments may sit with it', () => {
    const code = unsafe(
      '// Reads both ends.',
      '// SAFETY: the list is checked non-empty by the caller,',
      '// and its items are strings by construction.',
      '/** The two ends of a list. */',
      'export const ends = (items: readonly unknown[]) => ok([items[0]! as string, items.at(-1)! as string]);',
    );
    expect(code).toEqual([]);
  });

  test('a comment above a function covers its signature, not the statements of its body', () => {
    const found = unsafe(
      '// SAFETY: the parameter is only printed',
      'export function show(value: any) {',
      '  const text = value as string;',
      '  return ok(text);',
      '}',
    );
    expect(refusals(found)).toEqual(['safety-comment@4']);
  });

  test('a statement inside a block takes its comment inside the block', () => {
    const found = unsafe(
      'export function show(value: unknown) {',
      '  // SAFETY: every caller passes a string',
      '  const text = value as string;',
      '  return ok(text);',
      '}',
    );
    expect(found).toEqual([]);
  });

  test('a class member takes its own comment', () => {
    const found = unsafe(
      'export class Box {',
      '  // SAFETY: set by the constructor of every subclass',
      '  first = undefined as unknown as string;',
      '  second = undefined as unknown as string;',
      '}',
      'export const box = () => ok(new Box());',
    );
    expect(refusals(found)).toEqual(['safety-comment@5', 'safety-comment@5']);
  });

  test('leaves `as const` and `satisfies` alone', () => {
    expect(unsafe('export const kind = () => ({ ok: true as const, value: "a" satisfies string });')).toEqual([]);
  });

  test('only a // comment counts, as in Rust', () => {
    expect(refusals(unsafe('/* SAFETY: validated */', cast))).toEqual(['safety-comment@3']);
  });
});

describe('strict-compiler-options', () => {
  test('names the required options that are missing', () => {
    const compilerOptions = { noImplicitReturns: false, noImplicitOverride: false };
    const found = checkSafe('export const a = 1;\n', { compilerOptions });
    expect(found).toEqual([
      {
        rule: 'strict-compiler-options',
        file: 'tsconfig.json',
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
        message: 'Required compiler options missing: noImplicitReturns, noImplicitOverride.',
        help: 'Add to compilerOptions: "noImplicitReturns": true, "noImplicitOverride": true',
      },
    ]);
  });

  test('accepts a project with every required option', () => {
    expect(checkSafe('export const a = 1;\n')).toEqual([]);
  });
});
