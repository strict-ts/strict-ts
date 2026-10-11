import { describe, expect, test } from 'vitest';
import { defaultConfig } from '../src/index.js';
import { checkFiles as checkEverything, checkSafe as checkSafeEverything, checkUnsafe as checkUnsafeEverything, type Project, refusals } from './project.js';

// Each block below is about one rule, and many of its examples call JSON.parse or fetch as plain code does. What
// no-throwing-call says of those calls is left out here; its own block, at the end, reads everything.
const quiet = (found: ReturnType<typeof checkEverything>) => found.filter((d) => d.rule !== 'no-throwing-call' && d.rule !== 'no-throwing-operator' && d.rule !== 'use-once' && d.rule !== 'freeze-fresh');
const checkFiles = (files: Readonly<Record<string, string>>, project?: Project) => quiet(checkEverything(files, project));
const checkSafe = (text: string, project?: Project) => quiet(checkSafeEverything(text, project));
const checkUnsafe = (text: string, project?: Project) => quiet(checkUnsafeEverything(text, project));

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
      'export const labels = { admin: "Admin", user: "User" } satisfies Readonly<Record<(typeof roles)[number], string>>;',
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
      'no-ambient@3',
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
      'type Outcome = { readonly ok: true; readonly value: number } | { readonly ok: false; readonly error: string };',
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

describe('no-type-predicate', () => {
  test('refuses a written predicate: nothing checks that the body proves it', () => {
    const found = checkSafe('export const isText = (value: unknown): value is string => true;\n');
    expect(refusals(found)).toEqual(['no-type-predicate@1']);
    expect(found[0]?.help).toBe('Remove the annotation and let the compiler infer the predicate, or parse the value with a schema.');
  });

  test('accepts the predicate the compiler infers from the body, and it narrows as well', () => {
    const code = [
      'type Status = "draft" | "sent";',
      'const isStatus = (value: string) => value === "draft" || value === "sent";',
      'export const parse = (value: string): Status | undefined => (isStatus(value) ? value : undefined);',
    ].join('\n');
    expect(checkSafe(code)).toEqual([]);
  });

  test('refuses an assertion signature, and a predicate in a type', () => {
    const code = [
      'export function assertText(value: unknown): asserts value is string {}',
      'export type Guard = (value: unknown) => value is string;',
    ].join('\n');
    const found = checkSafe(code);
    expect(found.map((d) => `${d.start.line} ${d.message}`)).toEqual([
      '1 Assertion signature forbidden: nothing checks what it asserts.',
      '2 Written type predicate forbidden: nothing checks that the body proves it.',
    ]);
  });

  test('in unsafe/ it needs its reason', () => {
    const guard = 'const isText = (value: unknown): value is string => typeof value === "string";\nexport const text = (value: unknown) => Option.from(isText(value) ? value : undefined);\n';
    const header = 'import { Option } from "@strict-ts/std";\n';
    expect(refusals(checkUnsafe(header + guard))).toEqual(['safety-comment@2']);
    expect(checkUnsafe(`${header}// SAFETY: the body is the typeof check itself\n${guard}`)).toEqual([]);
  });
});

describe('no-ambient', () => {
  test('refuses declare in a source file', () => {
    const code = [
      'declare const injected: string;',
      'declare function now(): string;',
      'export const stamp = (): string => `${injected} ${now()}`;',
    ].join('\n');
    const found = checkSafe(code);
    expect(refusals(found)).toEqual(['no-ambient@1', 'no-ambient@2']);
    expect(found[0]?.message).toBe('`declare` is forbidden: it states a type the compiler cannot check.');
  });

  test('refuses declare global and declare module', () => {
    const global = ['export {};', 'declare global {', '  interface Window { readonly token: string }', '}'].join('\n');
    expect(refusals(checkSafe(global))).toEqual(['no-ambient@2']);
    expect(refusals(checkSafe('declare module "*.svg";\n'))).toEqual(['no-ambient@1']);
  });

  test("refuses the project's own declaration files outside unsafe/", () => {
    const files = {
      'src/a.ts': 'export const stamp = (): string => injected;\n',
      'src/globals.d.ts': 'declare const injected: string;\n',
    };
    expect(checkFiles(files)).toEqual([
      {
        rule: 'no-ambient',
        file: 'src/globals.d.ts',
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
        message: 'Declaration file outside unsafe/: what it declares is taken on trust.',
        help: 'Move it into an unsafe directory, beside the wrappers that use it.',
      },
    ]);
  });

  test('accepts a declaration file in an unsafe directory, and declare there with its reason', () => {
    const files = {
      'src/a.ts': 'import { token } from "./unsafe/env.js";\nexport const header = (): string => token().unwrapOr("");\n',
      'src/unsafe/globals.d.ts': 'declare const injected: string | undefined;\n',
      'src/unsafe/env.ts': 'import { Option } from "@strict-ts/std";\nexport const token = () => Option.from(injected);\n',
    };
    expect(checkFiles(files)).toEqual([]);
    const local = 'import { Option } from "@strict-ts/std";\ndeclare const injected: string | undefined;\nexport const token = () => Option.from(injected);\n';
    expect(refusals(checkUnsafe(local))).toEqual(['safety-comment@2']);
    expect(checkUnsafe(local.replace('declare const', '// SAFETY: set by the bundler at build time\ndeclare const'))).toEqual([]);
  });

  test('says nothing of the declaration files of dependencies', () => {
    expect(checkSafe('export const log = (): void => console.log(process.env["HOME"]);\n')).toEqual([]);
  });
});

describe('typing gaps closed in the existing rules', () => {
  test('no-non-null refuses a definite assignment, on a variable and on a property', () => {
    const code = ['let late!: string;', 'export class Box {', '  value!: number;', '}', 'export const read = (): string => late;'].join('\n');
    const found = checkSafe(code);
    expect(found.map((d) => `${d.rule}@${d.start.line} ${d.message}`)).toEqual([
      'no-non-null@1 Definite assignment `!:` forbidden.',
      'no-non-null@3 Definite assignment `!:` forbidden.',
    ]);
  });

  test('no-any refuses a bare name of type any that a dependency declares', () => {
    const code = 'import { z } from "zod";\nexport const schema: string = z;\n';
    const config = { unsafeDirs: ['src/unsafe'], allowedImports: ['zod'] };
    const found = checkSafe(code, { config });
    expect(found.map((d) => `${d.rule}@${d.start.line} ${d.message}`)).toEqual(['no-any@2 `z` has type `any`.']);
  });

  test('no-any still reports an any made in the file once, where it enters', () => {
    const code = 'export function parse(text: string): string {\n  const data = JSON.parse(text);\n  return String(data) + String(data);\n}\n';
    expect(refusals(checkSafe(code))).toEqual(['no-any@2']);
  });

  test('a namespace used in a type is not a value of type any', () => {
    const code = 'import { s } from "@strict-ts/std";\nconst Name = s.string;\nexport type Name = s.Infer<typeof Name>;\n';
    expect(checkSafe(code)).toEqual([]);
  });
});

describe('no-param-mutation', () => {
  // Alone: with read-only types the compiler itself refuses most of these, and this rule is what holds without them.
  const alone = { config: { ...defaultConfig, rules: ['no-param-mutation'] } };
  const messages = (code: string) => checkSafe(code, alone).map((d) => `${d.rule}@${d.start.line} ${d.message}`);

  test('refuses writing into what a parameter holds', () => {
    const code = [
      'interface Cart { total: number; items: string[]; tags: Record<string, string> }',
      'export function close(cart: Cart, index: number): void {',
      '  cart.total = 0;',
      '  cart.items[index] = "";',
      '  cart.total += 1;',
      '  cart.total++;',
      '  delete cart.tags["a"];',
      '}',
    ].join('\n');
    expect(messages(code)).toEqual([
      'no-param-mutation@3 Parameter `cart` is mutated.',
      'no-param-mutation@4 Parameter `cart` is mutated.',
      'no-param-mutation@5 Parameter `cart` is mutated.',
      'no-param-mutation@6 Parameter `cart` is mutated.',
      'no-param-mutation@7 Parameter `cart` is mutated.',
    ]);
  });

  test('refuses the methods that change an array, a map or a set', () => {
    const code = [
      'export function fill(list: number[], seen: Set<number>, byId: Map<string, number>): void {',
      '  list.push(1);',
      '  list.sort();',
      '  seen.add(1);',
      '  byId.set("a", 1);',
      '  (list).reverse();',
      '}',
    ].join('\n');
    expect(messages(code)).toEqual([
      'no-param-mutation@2 Parameter `list` is mutated by `push`.',
      'no-param-mutation@3 Parameter `list` is mutated by `sort`.',
      'no-param-mutation@4 Parameter `seen` is mutated by `add`.',
      'no-param-mutation@5 Parameter `byId` is mutated by `set`.',
      'no-param-mutation@6 Parameter `list` is mutated by `reverse`.',
    ]);
  });

  test('refuses reassigning a parameter', () => {
    const code = 'export function clamp(value: number): number {\n  if (value < 0) value = 0;\n  return value;\n}\n';
    expect(messages(code)).toEqual(['no-param-mutation@2 Parameter `value` is reassigned.']);
  });

  test('sees through destructuring and closures', () => {
    const code = [
      'export function add({ items }: { items: number[] }, [first]: number[][]): () => void {',
      '  first?.push(1);',
      '  return () => {',
      '    items.push(2);',
      '  };',
      '}',
    ].join('\n');
    expect(messages(code)).toEqual([
      'no-param-mutation@2 Parameter `first` is mutated by `push`.',
      'no-param-mutation@4 Parameter `items` is mutated by `push`.',
    ]);
  });

  test('accepts a parameter that asks for mutation with Mut<T>', () => {
    const code = [
      'import type { Mut } from "@strict-ts/std";',
      'export function fill(list: Mut<number[]>, cart: Mut<{ total: number }>): void {',
      '  list.push(1);',
      '  cart.total = 0;',
      '}',
    ].join('\n');
    expect(checkSafe(code, alone)).toEqual([]);
  });

  test('accepts reading a parameter, and changing a copy or a local', () => {
    const code = [
      'export function sorted(list: readonly number[], limit: number): number[] {',
      '  const copy = [...list];',
      '  copy.sort();',
      '  copy.push(limit);',
      '  let count = limit;',
      '  count += list.length;',
      '  return copy.slice(0, count).map((n) => n + 1);',
      '}',
    ].join('\n');
    expect(checkSafe(code, alone)).toEqual([]);
  });

  test('is not asked of unsafe/', () => {
    const code = 'import { ok } from "@strict-ts/std";\nexport const fill = (list: number[]) => ok(list.push(1));\n';
    expect(checkUnsafe(code)).toEqual([]);
  });

  test('known limit: a mutation through another name is not seen', () => {
    const code = 'export function fill(list: number[]): void {\n  const alias = list;\n  alias.push(1);\n}\n';
    expect(checkSafe(code, alone)).toEqual([]);
  });
});

describe('readonly-types', () => {
  const messages = (code: string) => checkSafe(code).map((d) => `${d.rule}@${d.start.line}:${d.start.column} ${d.message}`);

  test('refuses a mutable array or tuple type, and says what to write', () => {
    const found = checkSafe('export const total = (prices: number[], pair: [number, number]): number => prices.length + pair[0];\n');
    expect(found.map((d) => `${d.start.column} ${d.message}`)).toEqual(['31 Mutable array type.', '47 Mutable array type.']);
    expect(found[0]?.help).toBe('Write `readonly` in front of it, or wrap the type in `Mut<…>` when it is meant to change.');
  });

  test('refuses Array, Map, Set and a bare Record', () => {
    const code = [
      'export type A = Array<number>;',
      'export type B = Map<string, number>;',
      'export type C = Set<string>;',
      'export type D = Record<string, number>;',
    ].join('\n');
    expect(messages(code)).toEqual([
      'readonly-types@1:17 Mutable type `Array`.',
      'readonly-types@2:17 Mutable type `Map`.',
      'readonly-types@3:17 Mutable type `Set`.',
      'readonly-types@4:17 Mutable type `Record`.',
    ]);
  });

  test('refuses a property that can be reassigned: interface, type literal, class, index signature, constructor', () => {
    const code = [
      'export interface Line { label: string; readonly price: number }',
      'export type Point = { x: number };',
      'export class Counter {',
      '  count = 0;',
      '  constructor(public step: number) {}',
      '}',
      'export interface Bag { [key: string]: number }',
    ].join('\n');
    expect(messages(code)).toEqual([
      'readonly-types@1:25 Property `label` can be reassigned.',
      'readonly-types@2:23 Property `x` can be reassigned.',
      'readonly-types@4:3 Property `count` can be reassigned.',
      'readonly-types@5:15 Property `step` can be reassigned.',
      'readonly-types@7:24 Property `[index]` can be reassigned.',
    ]);
  });

  test('accepts the read-only forms', () => {
    const code = [
      'export interface Line { readonly label: string; readonly tags: readonly string[] }',
      'export type Pair = readonly [number, number];',
      'export type ById = ReadonlyMap<string, Line>;',
      'export type Seen = ReadonlySet<string>;',
      'export type Labels = Readonly<Record<string, string>>;',
      'export type Items = ReadonlyArray<Line>;',
      'export class Box {',
      '  constructor(readonly value: number) {}',
      '}',
    ].join('\n');
    expect(checkSafe(code)).toEqual([]);
  });

  test('accepts what asks for mutation with Mut<…>, on a type or on a property', () => {
    const code = [
      'import type { Mut } from "@strict-ts/std";',
      'export type Draft = Mut<{ title: string; tags: string[]; byId: Map<string, number> }>;',
      'export interface Counter { count: Mut<number>; readonly log: Mut<string[]> }',
      'export const collect = (): number[] => {',
      '  const seen: Mut<number[]> = [];',
      '  seen.push(1);',
      '  return seen;',
      '};',
    ].join('\n');
    expect(messages(code)).toEqual(['readonly-types@4:28 Mutable array type.']);
  });

  test('the compiler then refuses the mutation itself, through any name', () => {
    const code = [
      'export function fill(list: readonly number[], byId: ReadonlyMap<string, number>): void {',
      '  const alias = list;',
      '  alias.push(1);',
      '  byId.set("a", 1);',
      '}',
    ].join('\n');
    const config = { ...defaultConfig, rules: ['readonly-types'] };
    expect(refusals(checkSafe(code, { config }))).toEqual(['TS2339@3', 'TS2339@4']);
  });

  test('the schemas of the standard library infer read-only types', () => {
    const code = [
      'import { s } from "@strict-ts/std";',
      'const Cart = s.object({ id: s.string, items: s.array(s.number), note: s.optional(s.string) });',
      'export function clear(cart: s.Infer<typeof Cart>): void {',
      '  cart.id = "";',
      '  cart.items.push(1);',
      '}',
    ].join('\n');
    const config = { ...defaultConfig, rules: ['readonly-types'] };
    expect(refusals(checkSafe(code, { config }))).toEqual(['TS2540@4', 'TS2339@5']);
  });

  test('is not asked of unsafe/', () => {
    expect(checkUnsafe('import { ok } from "@strict-ts/std";\nexport const first = (items: string[]) => ok(items.length);\n')).toEqual([]);
  });
});

describe('constrained schemas of the standard library', () => {
  const header = [
    'import { s } from "@strict-ts/std";',
    'const Quantity = s.positive(s.integer());',
    'type Quantity = s.Infer<typeof Quantity>;',
    'const CustomerId = s.branded(s.string, "CustomerId");',
    'type CustomerId = s.Infer<typeof CustomerId>;',
    'const price = (quantity: Quantity, customer: CustomerId): string => `${customer}: ${quantity * 2}`;',
  ];
  const withBody = (...lines: readonly string[]) => checkSafe([...header, ...lines, ''].join('\n'));

  test('a value that went through the schema is accepted where the constrained type is asked', () => {
    const found = withBody(
      'export const quote = (raw: unknown, id: unknown) =>',
      '  Quantity.parse(raw).andThen((quantity) => CustomerId.parse(id).map((customer) => price(quantity, customer)));',
    );
    expect(found).toEqual([]);
  });

  test('a plain value is refused by the compiler: it did not pass the check', () => {
    expect(refusals(withBody('export const quote = price(2, "c1");'))).toEqual(['TS2345@7']);
  });

  test('two constraints are not confused, and neither are two branded names', () => {
    const wrongNumber = withBody(
      'const Positive = s.positive();',
      'export const quote = (raw: unknown, id: unknown) =>',
      '  Positive.parse(raw).andThen((n) => CustomerId.parse(id).map((customer) => price(n, customer)));',
    );
    expect(refusals(wrongNumber)).toEqual(['TS2345@9']);
    const wrongName = withBody(
      'const OrderId = s.branded(s.string, "OrderId");',
      'export const quote = (raw: unknown, id: unknown) =>',
      '  Quantity.parse(raw).andThen((quantity) => OrderId.parse(id).map((order) => price(quantity, order)));',
    );
    expect(refusals(wrongName)).toEqual(['TS2345@9']);
  });

  test('checks add up: a value with more of them is accepted where fewer are asked, not the reverse', () => {
    const found = withBody(
      'const Positive = s.positive();',
      'const half = (n: s.Infer<typeof Positive>): number => n / 2;',
      'export const ok = (raw: unknown) => Quantity.parse(raw).map(half);',
      'export const stacked: Quantity extends never ? "collapsed" : "kept" = "kept";',
    );
    expect(found).toEqual([]);
  });

  test('forging one outside unsafe/ needs a cast, which is refused', () => {
    expect(refusals(withBody('export const quote = price(2 as Quantity, "c1" as CustomerId);'))).toEqual(['no-cast@7', 'no-cast@7']);
  });

  test('a brand cannot be written by hand: its key is not exported', () => {
    const found = withBody(
      'const Tags = s.nonEmpty(s.array(s.string));',
      'type Tags = s.Infer<typeof Tags>;',
      'export const forged: Tags = Object.assign(["a"], { brand: "NonEmpty" });',
    );
    expect(refusals(found)).toEqual(['TS2322@9']);
  });

  test('a constrained value is still used as the plain one', () => {
    const found = withBody(
      'export const double = (raw: unknown): number => Quantity.parse(raw).map((quantity) => quantity * 2).unwrapOr(0);',
    );
    expect(found).toEqual([]);
  });
});

describe('pure-domain', () => {
  const config = { ...defaultConfig, pureDirs: ['src/domain'] };
  const inDomain = (code: string, others: Readonly<Record<string, string>> = {}) =>
    checkFiles({ 'src/domain/price.ts': code, ...others }, { config }).map((d) => `${d.file}:${d.start.line} ${d.rule} ${d.message}`);

  test('refuses the clock, randomness, the console and the network', () => {
    const code = [
      'export const stamp = (): number => Date.now();',
      'export const today = (): Date => new Date();',
      'export const dice = (): number => Math.random();',
      'export const log = (text: string): void => console.log(text);',
      'export const load = async (url: string): Promise<number> => (await fetch(url)).status;',
      'export const home = (): string | undefined => process.env["HOME"];',
    ].join('\n');
    expect(inDomain(code)).toEqual([
      'src/domain/price.ts:1 pure-domain `Date.now` reads the clock: not allowed in a pure directory.',
      'src/domain/price.ts:2 pure-domain `new Date()` reads the clock: not allowed in a pure directory.',
      'src/domain/price.ts:3 pure-domain `Math.random` is a source of randomness: not allowed in a pure directory.',
      'src/domain/price.ts:4 pure-domain `console` writes to the console: not allowed in a pure directory.',
      'src/domain/price.ts:5 pure-domain `fetch` reaches the network: not allowed in a pure directory.',
      'src/domain/price.ts:6 pure-domain `process` reads the process: not allowed in a pure directory.',
    ]);
  });

  test('refuses module-level state', () => {
    const code = 'let calls = 0;\nexport const count = (): number => calls;\nexport const limit = 3;\n';
    expect(inDomain(code)).toEqual(['src/domain/price.ts:1 pure-domain Module-level state in a pure directory.']);
  });

  test('refuses an import from outside the pure directories, however the path is written', () => {
    const others = { 'src/clock.ts': 'export const zero = 0;\n', 'src/domain/tax.ts': 'export const rate = 0.2;\n' };
    const code = [
      'import { zero } from "../clock.js";',
      'import { rate } from "./tax.js";',
      'import { zero as again } from "./../../src/clock.js";',
      'export const price = (net: number): number => net * (1 + rate) + zero + again;',
    ].join('\n');
    expect(inDomain(code, others)).toEqual([
      'src/domain/price.ts:1 pure-domain Import of "../clock.js", which is outside the pure directories.',
      'src/domain/price.ts:3 pure-domain Import of "./../../src/clock.js", which is outside the pure directories.',
    ]);
  });

  test('accepts computation: a date given as a value, Math, a local, a parameter named like a global', () => {
    const code = [
      'import { err, ok, type Result } from "@strict-ts/std";',
      'export const year = (iso: string): number => new Date(iso).getUTCFullYear();',
      'export const round = (value: number): number => Math.round(value * 100) / 100;',
      'export const total = (prices: readonly number[]): number => {',
      '  let sum = 0;',
      '  for (const price of prices) sum += price;',
      '  return sum;',
      '};',
      'export const half = (n: number): Result<number, "odd"> => (n % 2 === 0 ? ok(n / 2) : err("odd"));',
      'export const stamp = (now: number, console: { readonly lines: number }): number => now + console.lines;',
    ].join('\n');
    expect(inDomain(code)).toEqual([]);
  });

  test('says nothing outside the pure directories, and nothing when none is declared', () => {
    const code = 'export const stamp = (): number => Date.now();\n';
    expect(checkFiles({ 'src/app.ts': code }, { config })).toEqual([]);
    expect(checkFiles({ 'src/domain/price.ts': code })).toEqual([]);
  });

  test('the domain of the conforming fixture is pure', () => {
    const files = { 'src/domain/user.ts': 'import { panic } from "@strict-ts/std";\nexport const need = (name?: string): string => name ?? panic("no name");\n' };
    expect(checkFiles(files, { config })).toEqual([]);
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

describe('no-throwing-call', () => {
  const ours = (found: ReturnType<typeof checkEverything>) => found.filter((d) => d.rule === 'no-throwing-call');
  // The function named, and how it fails: the rest of a generated message is the example it was seen on.
  const said = (found: ReturnType<typeof checkEverything>) =>
    ours(found).map((d) => `${d.start.line} ${d.message.replace(/, as seen with .*$/, '.')}`);
  const safe = (...lines: readonly string[]) => said(checkSafeEverything([...lines, ''].join('\n')));
  const unsafe = (...lines: readonly string[]) => said(checkUnsafeEverything(['import { attempt, ok } from "@strict-ts/std";', ...lines, ''].join('\n')));

  test('refuses the library functions known to throw on what their types accept', () => {
    expect(
      safe(
        'export const a = (text: string): string => decodeURIComponent(text);',
        'export const b = (text: string): RegExp => new RegExp(text);',
        'export const c = (date: Date): string => date.toISOString();',
        'export const d = (n: number): string => "ab".repeat(n);',
        'export const e = (n: number): string => n.toFixed(n);',
        'export const f = (value: unknown): string => JSON.stringify(value);',
        'export const g = (text: string): bigint => BigInt(text);',
      ),
    ).toEqual([
      '1 `decodeURIComponent` throws a URIError.',
      '2 `RegExp.new` throws a SyntaxError.',
      '3 `Date.toISOString` throws a RangeError.',
      '4 `String.repeat` throws a RangeError.',
      '5 `Number.toFixed` throws a RangeError.',
      '6 `JSON.stringify` throws on a value it cannot convert: a symbol, an object without a prototype, a cycle.',
      '7 `BigInt` throws a SyntaxError.',
    ]);
  });

  test('a generated entry says what was seen: the error, and the call it was seen on', () => {
    const [found] = ours(checkSafeEverything('export const a = (text: string): string => decodeURIComponent(text);\n'));
    expect(found?.message).toBe('`decodeURIComponent` throws a URIError, as seen with ("%").');
  });

  test('a function that only throws on what it cannot convert is safe on plain values', () => {
    expect(
      safe(
        'export const a = (names: readonly string[]): string => names.join(", ");',
        'export const b = (ids: readonly (number | undefined)[]): string => String(ids);',
        'export const c = (things: readonly unknown[]): string => things.join(", ");',
        'export const d = (thing: unknown): string => String(thing);',
        'export const e = (things: readonly symbol[]): string => things.join(", ");',
        'export const f = (rows: readonly string[]): readonly string[] => [...rows].sort();',
        'export const g = (rows: readonly object[]): readonly object[] => [...rows].sort();',
        'export const h = (rows: readonly object[]): readonly object[] => [...rows].sort(() => 0);',
      ),
    ).toEqual([
      '3 `ReadonlyArray.join` throws on a value it cannot convert: a symbol, an object without a prototype, a cycle.',
      '4 `String` throws on a value it cannot convert: a symbol, an object without a prototype, a cycle.',
      '5 `ReadonlyArray.join` throws on a value it cannot convert: a symbol, an object without a prototype, a cycle.',
      '7 `Array.sort` throws on a value it cannot convert: a symbol, an object without a prototype, a cycle.',
    ]);
  });

  test('reduce throws only without a starting value', () => {
    expect(
      safe(
        'export const sum = (prices: readonly number[]): number => prices.reduce((a, b) => a + b);',
        'export const total = (prices: readonly number[]): number => prices.reduce((a, b) => a + b, 0);',
      ),
    ).toEqual(['1 `ReadonlyArray.reduce` throws a TypeError.']);
  });

  test('refuses a rejected promise made by hand: an exception by another name', () => {
    expect(safe('export const fail = (): Promise<number> => Promise.reject(new Error("no"));')).toEqual([
      '1 `Promise.reject` throws an Error.',
    ]);
  });

  test('accepts the library functions that do not throw', () => {
    expect(
      safe(
        'export const a = (text: string): number => Number.parseInt(text, 10) + Math.round(1.5);',
        'export const b = (items: readonly string[]): string => items.map((item) => item.trim()).join(",").padEnd(3);',
        'export const c = (iso: string): number => new Date(iso).getTime();',
        'export const d = (text: string): boolean => /^a+$/.test(text) && String(text).length > 0;',
        'export const e = (): void => console.log("done");',
      ),
    ).toEqual([]);
  });

  test('refuses any function declared in a package that is not allowed: its types do not say', () => {
    const code = 'export const load = async (url: string): Promise<number> => (await fetch(url)).status;\n';
    expect(said(checkSafeEverything(code))).toEqual(['1 `fetch` is declared in a declaration file, whose types do not say whether it throws.']);
  });

  test('trusts the allowed packages, the project itself, and a function it was handed', () => {
    expect(
      safe(
        'import { err, ok, Option, type Result, s } from "@strict-ts/std";',
        'const half = (n: number): Result<number, "odd"> => (n % 2 === 0 ? ok(n / 2) : err("odd"));',
        'export const run = (n: number, then: (value: number) => string): string =>',
        '  half(n).map(then).unwrapOr(Option.from(s.number.parse(n).unwrapOr(undefined)).map(String).unwrapOr(""));',
      ),
    ).toEqual([]);
  });

  test('accepts the call where it is caught: in attempt, or in a try with a catch', () => {
    expect(
      unsafe(
        'export const parse = (text: string) => attempt((): unknown => JSON.parse(text), String);',
        'export const load = (url: string) => attempt(async () => (await fetch(url)).status, String);',
        'export const decode = (text: string) => {',
        '  try {',
        '    return ok(decodeURIComponent(text));',
        '  } catch {',
        '    return ok(text);',
        '  }',
        '};',
      ),
    ).toEqual([]);
  });

  test('a try without a catch, and the catch or finally themselves, protect nothing', () => {
    expect(
      unsafe(
        'export const decode = (text: string) => {',
        '  try {',
        '    return ok(decodeURIComponent(text));',
        '  } finally {',
        '    decodeURIComponent(text);',
        '  }',
        '};',
        'export const again = (text: string) => {',
        '  try {',
        '    return ok(text);',
        '  } catch {',
        '    return ok(decodeURIComponent(text));',
        '  }',
        '};',
      ),
    ).toEqual([
      '4 `decodeURIComponent` throws a URIError.',
      '6 `decodeURIComponent` throws a URIError.',
      '13 `decodeURIComponent` throws a URIError.',
    ]);
  });

  test('is asked of unsafe/ too: returning a Result does not make a function catch', () => {
    const found = unsafe(
      'import { readFileSync } from "node:fs";',
      'export const read = (path: string) => ok(readFileSync(path, "utf8"));',
      'export const readSafely = (path: string) => attempt(() => readFileSync(path, "utf8"), String);',
    );
    expect(found).toEqual(['3 `readFileSync` is declared in a declaration file, whose types do not say whether it throws.']);
  });

  test('known limit: a helper that throws and is only called under attempt is refused where it is written', () => {
    const found = unsafe(
      'const parse = (text: string): unknown => JSON.parse(text);',
      'export const safe = (text: string) => attempt(() => parse(text), String);',
    );
    expect(found).toEqual(['2 `JSON.parse` throws a SyntaxError.']);
  });

  test('a library function that is not in the ledger is refused: nothing shows that it does not throw', () => {
    expect(safe('export const order = (locale: string): Intl.Collator => new Intl.Collator(locale);')).toEqual([
      '1 `Collator.new` is not in the effects ledger: nothing shows that it does not throw.',
    ]);
  });

  test('typed arrays and buffers are in the ledger: what was seen to throw, and what throws on a detached buffer', () => {
    const lines = [
      'export const a = (size: number): ArrayBuffer => new ArrayBuffer(size);',
      'export const b = (bytes: Uint8Array): Uint8Array => bytes.slice(1);',
      'export const c = (bytes: Uint8Array, value: number): boolean => bytes.includes(value);',
      'export const d = (view: DataView): number => view.getUint8(0);',
    ];
    expect(safe(...lines)).toEqual([
      '1 `ArrayBuffer.new` throws a RangeError.',
      '2 `Uint8Array.slice` throws a TypeError on a buffer that was detached.',
      '3 `Uint8Array.includes` throws a TypeError on a buffer that was detached.',
      '4 `DataView.getUint8` throws a RangeError.',
    ]);
    const assumed = said(checkSafeEverything([...lines, ''].join('\n'), { config: { unsafeDirs: ['src/unsafe'], allowedImports: ['@strict-ts/std'], assume: ['attached-buffers'] } }));
    expect(assumed).toEqual(['1 `ArrayBuffer.new` throws a RangeError.', '4 `DataView.getUint8` throws a RangeError.']);
  });

  test('an entry may depend on how many arguments are given', () => {
    expect(
      safe(
        'export const a = (n: number): string => n.toString();',
        'export const b = (n: number, radix: number): string => n.toString(radix);',
        'export const c = (x: string, y: string): number => x.localeCompare(y);',
        'export const d = (x: string, y: string, locale: string): number => x.localeCompare(y, locale);',
      ),
    ).toEqual([
      '2 `Number.toString` throws a RangeError.',
      '4 `String.localeCompare` throws a RangeError.',
    ]);
  });

  test('the trust comes from the configuration: a package that is not allowed is not trusted', () => {
    const code = 'import { ok } from "@strict-ts/std";\nexport const one = () => ok(1);\n';
    expect(said(checkSafeEverything(code))).toEqual([]);
    const config = { unsafeDirs: ['src/unsafe'], allowedImports: [] };
    expect(said(checkSafeEverything(code, { config }))).toEqual(['2 `ok` is declared in "@strict-ts/std", whose types do not say whether it throws.']);
  });
});

describe('no-throwing-call and the packages a project allows', () => {
  const said = (allowedImports: readonly string[]) =>
    checkEverything(
      {
        'src/a.ts': 'import { render } from "react";\nimport { join } from "@scope/paths";\nexport const a = render("x") + join("a");\n',
        'node_modules/@types/react/index.d.ts': 'export declare function render(x: string): string;\n',
        'node_modules/@types/scope__paths/index.d.ts': 'export declare function join(x: string): string;\n',
      },
      { config: { unsafeDirs: ['src/unsafe'], allowedImports } },
    )
      .filter((d) => d.rule === 'no-throwing-call')
      .map((d) => d.message);

  test('a package whose types come in another one is allowed under its own name', () => {
    expect(said([])).toHaveLength(2);
    expect(said(['react'])).toEqual(['`join` is declared in "@types/scope__paths", whose types do not say whether it throws.']);
    expect(said(['react', '@scope/paths'])).toEqual([]);
  });
});

describe('no-throwing-operator', () => {
  const said = (found: ReturnType<typeof checkEverything>) =>
    found.filter((d) => d.rule === 'no-throwing-operator').map((d) => `${d.start.line} ${d.message.replace(/, as seen with .*$/, '.')}`);
  const safe = (...lines: readonly string[]) => said(checkSafeEverything([...lines, ''].join('\n')));

  test('refuses the three bigint operators that throw, and their assignments', () => {
    expect(
      safe(
        'export const a = (x: bigint, y: bigint): bigint => x / y;',
        'export const b = (x: bigint, y: bigint): bigint => x % y;',
        'export const c = (x: bigint, y: bigint): bigint => x ** y;',
        'export const d = (x: bigint, y: bigint): bigint => { let z = x; z /= y; return z; };',
      ),
    ).toEqual(['1 `/` throws a RangeError.', '2 `%` throws a RangeError.', '3 `**` throws a RangeError.', '4 `/` throws a RangeError.']);
  });

  test('accepts them on numbers, and on a literal that cannot fail', () => {
    expect(
      safe(
        'export const a = (x: number, y: number): number => x / y + (x % y) + x ** y;',
        'export const b = (x: bigint): bigint => x / 2n + (x % -3n) + x ** 2n;',
        'export const c = (x: bigint, y: bigint): bigint => x * y + x - y;',
      ),
    ).toEqual([]);
    expect(safe('export const a = (x: bigint): bigint => x / 0n;', 'export const b = (x: bigint): bigint => 2n ** -1n;')).toEqual([
      '1 `/` throws a RangeError.',
      '2 `**` throws a RangeError.',
    ]);
  });

  test('refuses the conversion of a value that may not convert', () => {
    expect(
      safe(
        'export const a = (value: unknown): string => `got ${value}`;',
        'export const b = (value: { readonly a: number }): string => "got " + value;',
        'export const c = <T>(value: T): string => `${value}`;',
        'export const d = (value: object): number => +value;',
        'export const e = (x: { readonly a: number }, y: { readonly a: number }): boolean => x < y;',
        'export const f = (value: unknown): boolean => value == "a";',
        'export const g = (values: readonly unknown[]): string => `${values}`;',
      ),
    ).toEqual([
      '1 A template throws a TypeError.',
      '2 `+` throws a TypeError.',
      '3 A template throws a TypeError.',
      '4 `+` throws a TypeError.',
      '5 `<` throws a TypeError.',
      '6 `==` throws a TypeError.',
      '7 A template throws a TypeError.',
    ]);
  });

  test('accepts the conversion of plain values, branded ones, and the classes seen to convert', () => {
    expect(
      safe(
        'type Id = string & { readonly __brand: "id" };',
        'export const a = (id: Id, count: number, flag: boolean | undefined): string => `${id}: ${count} ${flag}`;',
        'export const b = <K extends string>(key: K): string => `key ${key}`;',
        'export const c = (from: Date, to: Date): boolean => from < to;',
        'export const d = (when: Date, names: readonly string[]): string => `${when} ${names}` + when;',
        'export const e = (error: Error, pattern: RegExp): string => `${error} ${pattern}`;',
        'export const f = (value: unknown): boolean => value === "a" || value == undefined;',
        'export const g = <T extends object>(holder: T, name: keyof T & string): string => `${name}`;',
        'export const h = (x: number, y: number): boolean => x < y && -x > ~y;',
      ),
    ).toEqual([]);
  });

  test('a class of the project named as one of the library is an object like any other', () => {
    expect(safe('class Date { readonly at = 1; }', 'export const a = (when: Date): string => `${when}`;', 'export const made = new Date();')).toEqual([
      '2 A template throws a TypeError.',
    ]);
  });

  test('what a tag receives is not converted, and the tag is a call', () => {
    const found = checkSafeEverything('export const a = (value: unknown): string => String.raw`got ${value}`;\n');
    expect(said(found)).toEqual([]);
    expect(found.filter((d) => d.rule === 'no-throwing-call').map((d) => d.message.replace(/, as seen with .*$/, '.'))).toHaveLength(1);
  });

  test('refuses an array length that is not written as one', () => {
    expect(
      safe(
        'import type { Mut } from "@strict-ts/std";',
        'export const a = (list: Mut<number[]>, size: number): void => { list.length = size; };',
        'export const b = (list: Mut<number[]>): void => { list.length = 0; };',
        'export const c = (list: Mut<number[]>): void => { list.length = -1; };',
        'export const d = (box: Mut<{ length: number }>, size: number): void => { box.length = size; };',
      ),
    ).toEqual([
      '2 Setting the length of an array throws a RangeError on a number that is not a length.',
      '4 Setting the length of an array throws a RangeError on a number that is not a length.',
    ]);
  });

  test('refuses a read that runs code and can throw', () => {
    expect(
      safe(
        'export const a = (view: DataView): number => view.byteLength;',
        'export const b = (run: () => void): unknown => run.caller;',
        'export const c = (bytes: Uint8Array, pattern: RegExp): string => `${bytes.byteLength} ${pattern.flags}`;',
        'export const d = (holder: { readonly caller: string }): string => holder.caller;',
      ),
    ).toEqual(['1 Reading `DataView.byteLength` throws a TypeError on a buffer that was detached.', '2 Reading `caller` on a function throws a TypeError.']);
  });

  test('accepts what is caught where it is written', () => {
    expect(
      safe(
        'export const a = (x: bigint, y: bigint): bigint => { try { return x / y; } catch { return 0n; } };',
        'export const b = (x: bigint, y: bigint): bigint => { try { return x; } finally { void (x / y); } };',
      ),
    ).toEqual(['2 `/` throws a RangeError.']);
  });

  test('says how to fix each', () => {
    const helps = checkSafeEverything('export const a = (x: bigint, y: bigint, v: unknown): string => `${x / y} ${v}`;\n')
      .filter((d) => d.rule === 'no-throwing-operator')
      .map((d) => d.help);
    expect(helps).toEqual([
      'Use `quotient`, `remainder` or `power` from @strict-ts/std, which give an Option, or write the divisor as a literal.',
      'Convert the value yourself first: `textOf(value)` from @strict-ts/std gives its text and never throws.',
    ]);
  });
});

describe('use-once', () => {
  const prelude = [
    'import { end, type Once } from "@strict-ts/std";',
    'export class Tx { query(text: string): number { return text.length; } readonly id = 1; }',
    'export const begin = (): Once<Tx> => new Tx();',
    'export const commit = (tx: Once<Tx>): number => end(tx).id;',
    'export const rollback = (tx: Once<Tx>): number => end(tx).id;',
    'export const log = (tx: Tx): number => tx.id;',
  ];
  const said = (...lines: readonly string[]) =>
    checkSafeEverything([...prelude, ...lines, ''].join('\n'))
      .filter((d) => d.rule === 'use-once')
      .map((d) => `${d.start.line - prelude.length} ${d.message}`);

  test('accepts a value used through its members and given away once', () => {
    expect(
      said(
        'export function a(): number { const tx = begin(); tx.query("x"); return commit(tx); }',
        'export function b(failed: boolean): number { const tx = begin(); if (failed) { return rollback(tx); } return commit(tx); }',
        'export function c(failed: boolean): number { const tx = begin(); if (failed) rollback(tx); else commit(tx); return 1; }',
        'export const d = (tx: Once<Tx>): number => commit(tx);',
        'export const e = (): Once<Tx> => { const tx = begin(); tx.query("x"); return tx; };',
        'export const f = (tx: Once<Tx>): number => { const mine: Once<Tx> = tx; return commit(mine); };',
        'export const g = (): number => commit(begin());',
        'export async function h(make: () => Promise<Once<Tx>>): Promise<number> { const tx = await make(); return commit(tx); }',
        'export function i(items: readonly string[]): number { const tx = begin(); for (const item of items) tx.query(item); return commit(tx); }',
        'export function j(items: readonly string[]): number { let n = 0; for (const item of items) { const tx = begin(); tx.query(item); n += commit(tx); } return n; }',
      ),
    ).toEqual([]);
  });

  test('refuses losing it: a path that ends without giving it away', () => {
    expect(
      said(
        'export function a(): number { const tx = begin(); return tx.query("x"); }',
        'export function b(failed: boolean): number { const tx = begin(); if (failed) return 0; return commit(tx); }',
        'export function c(failed: boolean): void { const tx = begin(); if (failed) commit(tx); }',
        'export function d(tx: Once<Tx>): void { tx.query("x"); }',
        'export function e(): void { begin(); }',
        'export function f(): number { return begin().query("x"); }',
      ),
    ).toEqual([
      '1 `tx` has one owner and is not given away before this `return`: it would be lost.',
      '2 `tx` has one owner and is not given away before this `return`: it would be lost.',
      '3 `tx` has one owner and is not given away on every path to the end of its block: it would be lost.',
      '4 `tx` has one owner and is not given away on every path to the end of the function: it would be lost.',
      '5 A value with one owner is made here and not kept: it is lost at once.',
      '6 A value with one owner is made here and not kept: it is lost at once.',
    ]);
  });

  test('refuses using it after it was given away, or may have been', () => {
    expect(
      said(
        'export function a(): number { const tx = begin(); commit(tx); return tx.query("x"); }',
        'export function b(): number { const tx = begin(); commit(tx); return commit(tx); }',
        'export function c(failed: boolean): number { const tx = begin(); if (failed) rollback(tx); return commit(tx); }',
      ),
    ).toEqual([
      '1 `tx` is used after it was given away.',
      '2 `tx` is used after it was given away.',
      // Given away on one path only: it is neither usable after, nor surely ended.
      '3 `tx` has one owner and is not given away before this `return`: it would be lost.',
      '3 `tx` is used after it may have been given away.',
    ]);
  });

  test('refuses a second owner, or an owner who does not know', () => {
    expect(
      said(
        'export function a(): number { const tx = begin(); log(tx); return commit(tx); }',
        'export function b(): number { const tx = begin(); const other = tx; return commit(other); }',
        'export function c(): number { const tx = begin(); const held = { tx }; return commit(held.tx); }',
        'export function d(): number { const tx = begin(); const plain = tx as Tx; return plain.id + commit(tx); }',
      ).map((line) => line.replace(/^(\d) `(\w+)` has one owner: it is used through its members, or given away whole\.$/, '$1 $2: not whole')),
    ).toEqual([
      '1 tx: not whole',
      '2 tx: not whole',
      '2 `tx` has one owner and is not given away before this `return`: it would be lost.',
      '3 tx: not whole',
      '3 `tx` has one owner and is not given away before this `return`: it would be lost.',
      '4 tx: not whole',
    ]);
  });

  test('refuses giving it away where the analysis does not follow', () => {
    expect(
      said(
        'export function a(items: readonly string[]): void { const tx = begin(); for (const item of items) { item.length; commit(tx); } }',
        'export function b(ok: boolean): void { const tx = begin(); ok && commit(tx); }',
        'export function c(ok: boolean): number { const tx = begin(); return ok ? commit(tx) : rollback(tx); }',
        'export function d(): () => number { const tx = begin(); return () => commit(tx); }',
        'export function e(): number { let tx = begin(); return commit(tx); }',
      ).map((line) => line.replace(/ has one owner.*| is given away where.*/, (rest) => (rest.includes('where') ? ': not followed' : rest.includes('another function') ? ': captured' : rest.includes('`let`') ? ': let' : ': lost'))),
    ).toEqual([
      '1 `tx`: lost',
      '1 `tx`: not followed',
      '2 `tx`: lost',
      '2 `tx`: not followed',
      '3 `tx`: lost',
      '3 `tx`: not followed',
      '3 `tx`: not followed',
      '4 `tx`: lost',
      '4 `tx`: captured',
      '5 `tx`: let',
    ]);
  });
});

describe('freeze-fresh', () => {
  const said = (...lines: readonly string[]) =>
    checkSafeEverything([...lines, ''].join('\n'))
      .filter((d) => d.rule === 'freeze-fresh')
      .map((d) => `${d.start.line} ${d.message}`);

  test('refuses freezing a value that already has a name', () => {
    expect(
      said(
        'import type { Mut } from "@strict-ts/std";',
        'export const a = (list: Mut<number[]>): readonly number[] => Object.freeze(list);',
        'export const b = (box: Mut<{ n: number }>): void => { Object.seal(box); Object.preventExtensions(box); Reflect.preventExtensions(box); };',
        'export const make = (): Mut<number[]> => [1];',
        'export const c = Object.freeze(make());',
      ),
    ).toEqual([
      '2 `Object.freeze` is given a value that already has a name: a write through that name would throw.',
      '3 `Object.seal` is given a value that already has a name: a write through that name would throw.',
      '3 `Object.preventExtensions` is given a value that already has a name: a write through that name would throw.',
      '3 `Reflect.preventExtensions` is given a value that already has a name: a write through that name would throw.',
      '5 `Object.freeze` is given a value that already has a name: a write through that name would throw.',
    ]);
  });

  test('accepts freezing a value where it is made', () => {
    expect(
      said(
        'export const a = Object.freeze([1, 2]);',
        'export const b = Object.freeze({ name: "x", tags: ["a"] } as const);',
        'export const c = Object.freeze(new Map<string, number>());',
        'export const d = Object.freeze(({ n: 1 }));',
        'export const freeze = (n: number): number => n;',
        'export const e = freeze(1);',
      ),
    ).toEqual([]);
  });
});
