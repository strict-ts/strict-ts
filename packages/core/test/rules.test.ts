import { describe, expect, test } from 'vitest';
import { defaultConfig } from '../src/index.js';
import { checkFiles as checkEverything, checkSafe as checkSafeEverything, checkUnsafe as checkUnsafeEverything, type Project, refusals } from './project.js';

// Each block below is about one rule, and many of its examples call JSON.parse or fetch as plain code does. What
// no-throwing-call says of those calls is left out here; its own block, at the end, reads everything.
const quiet = (found: ReturnType<typeof checkEverything>) => found.filter((d) => d.rule !== 'no-throwing-call' && d.rule !== 'no-throwing-operator' && d.rule !== 'use-once' && d.rule !== 'freeze-fresh' && d.rule !== 'mut-from-readonly');
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

describe('no-any in JSX', () => {
  const jsx = 'declare namespace JSX { interface Element { readonly html: string } interface IntrinsicElements { [tag: string]: Record<string, any> } }\n';
  const check = (text: string) =>
    checkFiles({ 'src/a.tsx': text, 'node_modules/@types/page/index.d.ts': jsx }, { compilerOptions: { jsx: 1, types: ['page'] } }).filter((d) => d.file === 'src/a.tsx');

  test('the name of an element is not a value: it is not an `any` that entered', () => {
    expect(refusals(check('export const a = (label: string) => <div class="x"><span>{label}</span></div>;\n'))).toEqual([]);
  });

  test('an `any` written inside an element is still one', () => {
    expect(refusals(check('export const a = (label: any) => <div>{label}</div>;\n'))).toEqual(['no-any@1']);
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

  const refusedAt = (lines: readonly string[]) => checkSafe([...lines, ''].join('\n'), alone).map((d) => `${d.start.line} ${d.message}`);

  test('follows another name for the parameter, or for a part of it', () => {
    const lines = [
      'type Cart = { readonly lines: Line[]; readonly note: string };',
      'type Line = { quantity: number };',
      'export function a(cart: Cart): void {',
      '  const alias = cart;',
      '  alias.lines.push({ quantity: 1 });',
      '  for (const line of cart.lines) line.quantity *= 2;',
      '  const { lines } = cart;',
      '  lines.pop();',
      '  const found = cart.lines.find((line) => line.quantity > 0) ?? cart.lines[0];',
      '  if (found !== undefined) found.quantity = 0;',
      '  let work: Line = { quantity: 0 };',
      '  work.quantity = 1;',
      '  work = cart.lines[0] ?? work;',
      '}',
    ];
    expect(refusedAt(lines)).toEqual([
      '5 Parameter `cart` is mutated by `push`, through `alias`.',
      '6 Parameter `cart` is mutated, through `line`.',
      '8 Parameter `cart` is mutated by `pop`, through `lines`.',
      '10 Parameter `cart` is mutated, through `found`.',
      '12 Parameter `cart` is mutated, through `work`.',
    ]);
  });

  test('a new container of what a parameter holds may be written; what it holds may not', () => {
    const lines = [
      'type Line = { quantity: number };',
      'export function a(given: Line[]): Line[] {',
      '  const sorted = given.slice();',
      '  sorted.sort((left, right) => left.quantity - right.quantity);',
      '  const more = [...given];',
      '  more.push({ quantity: 1 });',
      '  const first = more[0];',
      '  if (first !== undefined) first.quantity = 9;',
      '  for (const line of given.filter((one) => one.quantity > 0)) line.quantity = 0;',
      '  const { ...rest } = { list: given };',
      '  rest.list = [];',
      '  return sorted;',
      '}',
    ];
    expect(refusedAt(lines)).toEqual(['8 Parameter `given` is mutated, through `first`.', '9 Parameter `given` is mutated, through `line`.']);
  });

  test('refuses a write by a pattern, by the target of a loop and by a function of the platform', () => {
    const lines = [
      'type State = { count: number; when: Date; name: string };',
      'export function a(state: State): string {',
      '  [state.count] = [5];',
      '  for (state.count of [1, 2]);',
      '  Reflect.set(state, "count", 7);',
      '  state.when.setTime(0);',
      '  return state.name.replace("a", "b");',
      '}',
    ];
    expect(refusedAt(lines)).toEqual([
      '3 Parameter `state` is mutated.',
      '4 Parameter `state` is mutated.',
      '5 Parameter `state` is mutated by `Reflect.set`.',
      '6 Parameter `state` is mutated by `setTime`.',
    ]);
  });

  test('a parameter that asks for mutation is changed through any name', () => {
    const lines = [
      'import type { Mut } from "@strict-ts/std";',
      'export function a(cart: Mut<{ lines: number[] }>): void {',
      '  const { lines } = cart;',
      '  lines.push(1);',
      '  for (const line of [cart]) line.lines.pop();',
      '}',
    ];
    expect(refusedAt(lines)).toEqual([]);
  });

  test('the object a method is called on is one of the things it receives', () => {
    const lines = [
      'import type { Mut } from "@strict-ts/std";',
      'export class Counter {',
      '  value: Mut<number> = 0;',
      '  readonly log: Mut<string[]> = [];',
      '  readonly started: number = this.value;',
      '  constructor(start: number) {',
      '    this.value = start;',
      '  }',
      '  set shown(text: string) {',
      '    this.log.push(text);',
      '  }',
      '  read(): number {',
      '    this.log.push("read");',
      '    this.value += 1;',
      '    return this.value;',
      '  }',
      '  increment(this: Mut<Counter>): void {',
      '    this.value += 1;',
      '    const self = this;',
      '    self.log.push("more");',
      '  }',
      '  twice(): void {',
      '    this.increment();',
      '  }',
      '  readonly later = (): void => {',
      '    this.value = 0;',
      '  };',
      '}',
      'export function a(counter: Counter, open: Mut<Counter>): void {',
      '  counter.increment();',
      '  open.increment();',
      '}',
    ];
    expect(refusedAt(lines)).toEqual([
      '13 `this` is mutated by `push`, in a function that does not say `this: Mut<…>`.',
      '14 `this` is mutated, in a function that does not say `this: Mut<…>`.',
      '23 `this` is mutated by `increment`, which says `this: Mut<…>`, in a function that does not say `this: Mut<…>`.',
      '26 `this` is mutated, in a function that does not say `this: Mut<…>`.',
      '30 Parameter `counter` is mutated by `increment`, which says `this: Mut<…>`.',
    ]);
  });

  test('what a function of the project gives back is written only if its return type says so', () => {
    const lines = [
      'import type { Mut } from "@strict-ts/std";',
      'type State = { count: number; readonly tags: Mut<string[]> };',
      'const held: State = { count: 0, tags: [] };',
      'const same = <T>(value: T): T => value;',
      'const current = (): State => held;',
      'const open = (): Mut<State> => held;',
      'const later = async (): Promise<Mut<State>> => held;',
      'export async function a(given: State): Promise<void> {',
      '  const alias = same(given);',
      '  alias.count += 1;',
      '  const now = current();',
      '  now.tags.push("x");',
      '  for (const tag of current().tags) tag.trim();',
      '  open().count += 1;',
      '  const mine = open();',
      '  mine.count += 1;',
      '  (await later()).count += 1;',
      '  const made = await later();',
      '  made.tags.pop();',
      '  const list = Array.of(1, 2);',
      '  list.push(3);',
      '  const stated: Mut<State> = { ...current(), tags: [] };',
      '  stated.count = 2;',
      '}',
    ];
    expect(refusedAt(lines)).toEqual([
      '10 `alias` is mutated, and `same` that gave it does not say it may be: its return type has no `Mut<…>`.',
      '12 `now` is mutated by `push`, and `current` that gave it does not say it may be: its return type has no `Mut<…>`.',
    ]);
  });

  test('a write straight into what a call gave, with no name for it, is refused as well', () => {
    const code = 'type State = { count: number };\nconst held: State = { count: 0 };\nconst current = (): State => held;\nexport function bump(): void {\n  current().count += 1;\n}\n';
    expect(checkSafe(code, alone).map((d) => `${d.start.line} ${d.message}`)).toEqual(['5 What a call gave is mutated, and `current` that gave it does not say it may be: its return type has no `Mut<…>`.']);
  });

  test('to write into what a field or a list holds, the field or the list says so', () => {
    const lines = [
      'import type { Mut } from "@strict-ts/std";',
      'type Line = { quantity: number };',
      'export class Cart {',
      '  readonly kept: Line;',
      '  readonly owned: Mut<Line>;',
      '  readonly made = { quantity: 0 };',
      '  readonly lines: Mut<Line[]> = [];',
      '  readonly open: Mut<Mut<Line>[]> = [];',
      '  constructor(kept: Line, owned: Mut<Line>) {',
      '    this.kept = kept;',
      '    this.owned = owned;',
      '  }',
      '  change(this: Mut<Cart>, given: Line, mine: Mut<Line>): void {',
      '    this.kept.quantity = 1;',
      '    this.owned.quantity = 1;',
      '    this.made.quantity = 1;',
      '    this.lines.push(given);',
      '    for (const line of this.lines) line.quantity = 1;',
      '    const first = this.lines[0];',
      '    if (first !== undefined) first.quantity = 1;',
      '    this.open.push(mine);',
      '    for (const line of this.open) line.quantity = 1;',
      '  }',
      '}',
      'export function collect(given: Line, mine: Mut<Line>): readonly Line[] {',
      '  const seen: Mut<Line[]> = [];',
      '  seen.push(given);',
      '  const loose = [];',
      '  loose.push(given);',
      '  for (const line of loose) line.quantity = 1;',
      '  const own = [mine];',
      '  for (const line of own) line.quantity = 1;',
      '  return seen;',
      '}',
    ];
    expect(refusedAt(lines)).toEqual([
      '14 What the field `kept` holds is mutated, and the field does not say it may be: its type has no `Mut<…>`.',
      '18 What `lines` holds is mutated, and its type says the container may be written, not what it holds.',
      '20 What `lines` holds is mutated, and its type says the container may be written, not what it holds.',
      '30 Parameter `given` is mutated, through `line`.',
    ]);
    // What is put in a list that says its elements may be written has to be something to change.
    expect(checkSafeEverything([...lines.slice(0, 21).map((line) => line.replace('this.open.push(mine)', 'this.open.push(given)')), '  }', '}', ''].join('\n')).filter((d) => d.rule === 'mut-from-readonly').map((d) => d.start.line)).toEqual([21]);
  });

  test('a name of the project for a type is read through, and a class of the project is not a list', () => {
    const lines = [
      'import type { Mut } from "@strict-ts/std";',
      'type Line = { quantity: number };',
      'type Store = Mut<Map<string, Mut<Line>>>;',
      'type Plain = Mut<Map<string, Line>>;',
      'export class Shelf {',
      '  private readonly lines: Mut<Mut<Line>[]> = [];',
      '  get(at: number): Mut<Line> | undefined {',
      '    return this.lines[at];',
      '  }',
      '  find(at: number): Line | undefined {',
      '    return this.lines[at];',
      '  }',
      '  add(line: Line): number {',
      '    return this.lines.length + line.quantity;',
      '  }',
      '}',
      'interface Sink { readonly add: (line: Line) => void }',
      'export function a(store: Store, plain: Plain, shelf: Shelf, sink: Sink): void {',
      '  const named = store.get("a");',
      '  if (named !== undefined) named.quantity = 1;',
      '  const other = plain.get("a");',
      '  if (other !== undefined) other.quantity = 1;',
      '  const first = shelf.get(0);',
      '  if (first !== undefined) first.quantity = 1;',
      '  const found = shelf.find(0);',
      '  if (found !== undefined) found.quantity = 1;',
      '  shelf.add({ quantity: 1 });',
      '  sink.add({ quantity: 1 });',
      '}',
    ];
    expect(refusedAt(lines)).toEqual([
      // `Store` is a name for a `Mut<…>` that says it inside too; `Plain` says it around the map only.
      '22 What `plain` holds is mutated, and its type says the container may be written, not what it holds.',
      '26 `found` is mutated, and `Shelf.find` that gave it does not say it may be: its return type has no `Mut<…>`.',
      // `Sink` only declares `add`: nothing says what stands behind it, so its name is what is read.
      '28 Parameter `sink` is mutated by `add`.',
    ]);
  });

  test('a parameter with no written type asks for mutation when the place its function is given to does', () => {
    const lines = [
      'import type { Mut } from "@strict-ts/std";',
      'type Pen = { colour: string };',
      'const draw = (paint: (pen: Mut<Pen>, size: number) => void): void => paint({ colour: "" }, 1);',
      'const look = (read: (pen: Pen) => void): void => read({ colour: "" });',
      'draw((pen, size) => {',
      '  pen.colour = `${size}`;',
      '});',
      'look((pen) => {',
      '  pen.colour = "red";',
      '});',
      '[{ colour: "" }].forEach((pen) => {',
      '  pen.colour = "blue";',
      '});',
    ];
    expect(refusedAt(lines)).toEqual(['9 Parameter `pen` is mutated.', '12 Parameter `pen` is mutated.']);
  });

  test('a function kept by a constructor does not write the object later, and `call` gives a receiver', () => {
    const lines = [
      'import type { Mut } from "@strict-ts/std";',
      'export class Counter {',
      '  value: Mut<number> = 0;',
      '  readonly bump: () => void;',
      '  constructor() {',
      '    this.value = 1;',
      '    this.bump = () => {',
      '      this.value += 1;',
      '    };',
      '  }',
      '}',
      'function reset(this: Mut<Counter>): void {',
      '  this.value = 0;',
      '}',
      'export function touch(given: Counter, steps: Iterator<number>): void {',
      '  reset.call(given);',
      '  steps.next();',
      '}',
    ];
    expect(refusedAt(lines)).toEqual([
      '8 `this` is mutated, in a function that does not say `this: Mut<…>`.',
      '16 Parameter `given` is mutated by `call` of a function that says `this: Mut<…>`.',
      '17 Parameter `steps` is mutated by `next`.',
    ]);
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
    'const Quantity = s.positive(s.integer(s.number));',
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
      'const Positive = s.positive(s.number);',
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
      'const Positive = s.positive(s.number);',
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

describe('no-throwing-call on a function value', () => {
  test('a callback the library hands over is called freely: resolving a promise does not throw', () => {
    const found = checkSafeEverything(
      [
        'export const wait = (ms: number): Promise<void> => new Promise<void>((resolve) => { resolve(); void ms; });',
        'export const later = (): Promise<number> => new Promise<number>((resolve, reject) => { if (Math.random() > 2) reject(new Error("no")); resolve(1); });',
        'export const each = (list: readonly number[], run: (n: number) => void): void => list.forEach((n) => run(n));',
        '',
      ].join('\n'),
    );
    expect(found.filter((d) => d.rule === 'no-throwing-call').map((d) => `${d.start.line} ${d.message}`)).toEqual([]);
  });

  test('a function of the library reached through a value keeps its name, and its verdict', () => {
    const found = checkSafeEverything('const parse = JSON.parse;\nexport const a = (text: string): unknown => parse(text);\n');
    expect(found.filter((d) => d.rule === 'no-throwing-call').map((d) => d.message.replace(/, as seen with .*$/, '.'))).toEqual(['`JSON.parse` throws a SyntaxError.']);
  });
});

describe('no-throwing-call and what an allowed package exports from another', () => {
  const said = (allowedImports: readonly string[]) =>
    checkEverything(
      {
        'src/a.ts': [
          'import { ref } from "vue";',
          'import * as Vue from "vue";',
          'import { ref as inner } from "@vue/reactivity";',
          'export const a = ref(1);',
          'export const b = Vue.ref(2);',
          'export const c = inner(3);',
          'export const d = auto(4);',
          '',
        ].join('\n'),
        // What a framework generates for the names it imports by itself.
        'types/imports.d.ts': 'export {};\ndeclare global {\n  const auto: typeof import("vue").ref;\n}\n',
        'node_modules/vue/index.d.ts': 'export { ref } from "@vue/reactivity";\n',
        'node_modules/@vue/reactivity/index.d.ts': 'export declare function ref(x: number): number;\n',
      },
      { config: { unsafeDirs: ['src/unsafe'], allowedImports } },
    )
      .filter((d) => d.rule === 'no-throwing-call')
      .map((d) => `${d.start.line} ${d.message}`);

  test('what is imported from an allowed package is trusted, wherever that package keeps it', () => {
    expect(said([])).toHaveLength(4);
    // Imported from the inner package itself, it is the inner package that must be allowed.
    expect(said(['vue'])).toEqual(['6 `ref` is declared in "@vue/reactivity", whose types do not say whether it throws.']);
    expect(said(['vue', '@vue/reactivity'])).toEqual([]);
  });
});

describe('no-external-import and the path aliases of a project', () => {
  const found = (specifier: string) =>
    refusals(
      checkFiles(
        {
          'src/lib/types.ts': 'export const size = 1;\n',
          'src/a.ts': `import { size } from "${specifier}";\nexport const a = size;\n`,
          'node_modules/dep/index.d.ts': 'export declare const size: number;\n',
          'vendor/legacy.d.ts': 'export declare const size: number;\n',
        },
        {
          compilerOptions: {
            paths: {
              '@/*': ['/strict-ts-fixture/src/*'],
              'own-name': ['/strict-ts-fixture/src/lib/types.ts'],
              'hidden/*': ['/strict-ts-fixture/node_modules/*'],
              legacy: ['/strict-ts-fixture/vendor/legacy.d.ts'],
            },
          },
        },
      ),
    ).filter((refusal) => refusal.startsWith('no-external-import'));

  test('an alias that leads to a file of the project is that file, not a dependency', () => {
    expect(found('@/lib/types')).toEqual([]);
    expect(found('own-name')).toEqual([]);
  });

  test('an alias that leads to a dependency, or nowhere, is refused', () => {
    expect(found('hidden/dep')).toEqual(['no-external-import@1']);
    expect(found('dep')).toEqual(['no-external-import@1']);
    // Declarations the project keeps for a library say what the library is: the rules do not read it.
    expect(found('legacy')).toEqual(['no-external-import@1']);
    expect(found('@/lib/missing')).toEqual(['no-external-import@1']);
  });
});

describe('no-overload', () => {
  const only = (found: ReturnType<typeof checkSafe>) => refusals(found).filter((refusal) => refusal.startsWith('no-overload') || refusal.startsWith('safety-comment'));

  test('refuses each signature that an implementation follows: of a function, a method, a constructor', () => {
    const code = [
      'export function coerce<T>(value: unknown): T;',
      'export function coerce(value: unknown): unknown {',
      '  return value;',
      '}',
      'export class Reader {',
      '  constructor(text: string);',
      '  constructor(count: number);',
      '  constructor(readonly given: number | string) {}',
      '  read(as: "text"): string;',
      '  read(as: "count"): number;',
      '  read(as: string): number | string {',
      '    return as === "text" ? String(this.given) : 0;',
      '  }',
      '}',
      '',
    ].join('\n');
    expect(only(checkSafe(code))).toEqual(['no-overload@1', 'no-overload@6', 'no-overload@7', 'no-overload@9', 'no-overload@10']);
    expect(checkSafe(code).find((d) => d.rule === 'no-overload')?.message).toBe('Overload signature forbidden: nothing checks that the implementation keeps this promise.');
  });

  test('accepts what has no body for another reason: an abstract method, a type with several call signatures', () => {
    const code = [
      'export abstract class Shape {',
      '  abstract area(): number;',
      '}',
      'export interface Parse {',
      '  (text: string): string;',
      '  (count: number): number;',
      '}',
      'export type Pick = { of(text: string): string; of(count: number): number };',
      '',
    ].join('\n');
    expect(only(checkSafe(code))).toEqual([]);
  });

  test('a declaration of what is defined elsewhere is not an overload: `no-ambient` answers for it', () => {
    expect(refusals(checkSafe('declare function now(): string;\ndeclare function now(zone: string): string;\nexport const a = now;\n')).filter((r) => !r.startsWith('no-ambient'))).toEqual([]);
  });

  test('in an unsafe directory an overload is allowed, with its reason', () => {
    const code = (comment: string) =>
      ['import { ok, type Result } from "@strict-ts/std";', comment, 'export function twice(n: number): Result<number, string>;', 'export function twice(n: number): Result<number, string> {', '  return ok(n * 2);', '}', ''].join('\n');
    expect(only(checkUnsafe(code('// the same promise, kept')))).toEqual(['safety-comment@3']);
    expect(only(checkUnsafe(code('// SAFETY: the implementation returns exactly this.')))).toEqual([]);
  });
});

describe('no-method-signature', () => {
  const only = (code: string) => refusals(checkSafe(code)).filter((refusal) => refusal.startsWith('no-method-signature'));

  test('refuses the method syntax in an interface and in a type, optional and generic ones too', () => {
    const code = [
      'export interface Handler {',
      '  handle(animal: string): number;',
      '  close?(): void;',
      '  map<T>(value: T): T;',
      '}',
      'export type Reader = { read(): string };',
      '',
    ].join('\n');
    expect(only(code)).toEqual(['no-method-signature@2', 'no-method-signature@3', 'no-method-signature@4', 'no-method-signature@6']);
  });

  test('accepts a property with a function type, a call signature, and the methods of a class', () => {
    const code = [
      'export interface Handler {',
      '  readonly handle: (animal: string) => number;',
      '  (direct: string): number;',
      '}',
      'export class Counter {',
      '  count(): number {',
      '    return 1;',
      '  }',
      '}',
      '',
    ].join('\n');
    expect(only(code)).toEqual([]);
  });

  test('written as a property, a narrower implementation is refused by the compiler', () => {
    const lines = (member: string) =>
      [
        'interface Animal { readonly name: string }',
        'interface Dog extends Animal { readonly tricks: readonly string[] }',
        `interface Handler { ${member} }`,
        'const dogsOnly = { handle: (dog: Dog): number => dog.tricks.length };',
        'export const handler: Handler = dogsOnly;',
        '',
      ].join('\n');
    const compiler = (code: string) => refusals(checkSafe(code)).filter((refusal) => refusal.startsWith('TS'));
    expect(compiler(lines('handle(animal: Animal): number;'))).toEqual([]);
    expect(compiler(lines('readonly handle: (animal: Animal) => number;'))).toEqual(['TS2322@5']);
  });
});

describe('no-default-on-undefined', () => {
  const only = (...lines: readonly string[]) => refusals(checkSafe([...lines, ''].join('\n'))).filter((refusal) => refusal.startsWith('no-default-on-undefined'));
  const at = (...numbers: readonly number[]) => numbers.map((line) => `no-default-on-undefined@${line}`);

  test('refuses a default on a parameter whose type says undefined: what the caller gave on purpose is lost', () => {
    expect(
      only(
        'type Topic = "news" | "sport";',
        'export const correct = (id: string, topic: Topic | "keep" | undefined = "keep"): string => `${id} ${topic}`;',
        'export function other(count: number | undefined = 1): number { return count; }',
        'export class Box { constructor(readonly size: number | undefined = 1) {} grow(by: number | undefined = 1): number { return by; } }',
        'interface Options { readonly tone?: "plain" | "loud" }',
        'export const chip = (tone: Options["tone"] = "plain"): string => tone;',
      ),
    ).toEqual(at(2, 3, 4, 4, 6));
  });

  test('accepts a default where undefined is not a value of the type, and a default that is undefined', () => {
    expect(
      only(
        'export const a = (count: number = 1, name = "x"): string => `${count} ${name}`;',
        'export const b = (count: number | undefined = undefined): number => count ?? 1;',
        'export const c = (count: number | undefined = void 0): number => count ?? 1;',
        'export const d = (count?: number): number => count ?? 1;',
      ),
    ).toEqual([]);
  });

  test('a function written where a type is expected is read with that type', () => {
    expect(
      only(
        'type Clear = (topic: string | undefined) => string;',
        'type Maybe = (topic?: string) => string;',
        'export const a: Clear = (topic = "keep") => topic;',
        'export const b: Maybe = (topic = "keep") => topic;',
        'export const c = [1, undefined].map((value = 0) => value);',
        'export const d = [1, 2].map((value = 0) => value);',
        // Expected to have one of two types: one of them is enough.
        'export const e: Clear | Maybe = (topic = "keep") => topic;',
        'export const f: { (topic: string | undefined): string; (topic: string, more: number): string } = (topic = "keep") => topic;',
      ),
    ).toEqual(at(3, 5, 7, 8));
  });

  test('a name taken out by a pattern: an optional property is absent or given, one that says undefined is refused', () => {
    expect(
      only(
        'interface Props { readonly size?: number; readonly tone: string | undefined; readonly both?: number | undefined; readonly label: string }',
        'export const a = ({ size = 1, label }: Props): string => `${size} ${label}`;',
        'export const b = ({ tone = "plain" }: Props): string => tone;',
        'export const c = ({ both = 2 }: Props): number => both;',
        'export const d = ({ tone = undefined }: Props): string => tone ?? "";',
        'export const e = (props: Props): number => { const { size = 1, both: renamed = 3 } = props; return size + renamed; };',
        'export const f = ({ size = 1 }: Partial<Props>): number => size;',
        'export const g = ({ inner: { tone = "x" } }: { readonly inner: Props }): string => tone;',
      ),
    ).toEqual(at(3, 4, 6, 8));
  });

  test('a pattern over a list: an element that may be missing is not one that is undefined', () => {
    expect(
      only(
        'export const a = (list: readonly number[]): number => { const [first = 0] = list; return first; };',
        'export const b = (list: readonly (number | undefined)[]): number => { const [first = 0] = list; return first; };',
        'export const c = (pair: readonly [number | undefined, number]): number => { const [first = 0, second = 1] = pair; return first + second; };',
        'export const d = (pair: readonly [number, number?]): number => { const [first, second = 1] = pair; return first + second; };',
        'export const e = (bag: Readonly<Record<string, number | undefined>>): number => { const { count = 0 } = bag; return count; };',
      ),
    ).toEqual(at(2, 3, 5));
  });
});

describe('no-numeric-enum', () => {
  const only = (code: string) => refusals(checkSafe(code)).filter((refusal) => refusal.startsWith('no-numeric-enum'));

  test('refuses an enum with a member that is a number, written or not', () => {
    const code = [
      'export enum Level { Low, High }',
      'export enum Flag { Read = 1, Write = 2 }',
      'export const enum Mixed { A = "a", B = 2 }',
      'export enum Built { A = "a".length }',
      '',
    ].join('\n');
    expect(only(code)).toEqual(['no-numeric-enum@1', 'no-numeric-enum@2', 'no-numeric-enum@3', 'no-numeric-enum@4']);
  });

  test('accepts an enum whose members are all texts: only its members are accepted where it is asked for', () => {
    const code = ['export enum Level { Low = "low", High = "high" }', 'export const enum Side { Left = `left`, Right = "right" }', ''].join('\n');
    expect(only(code)).toEqual([]);
    const compiler = (text: string) => refusals(checkSafe(text)).filter((refusal) => refusal.startsWith('TS'));
    expect(compiler('enum Level { Low = "low", High = "high" }\nconst given: string = "low";\nexport const level: Level = given;\n')).toEqual(['TS2322@3']);
    expect(compiler('enum Level { Low, High }\nconst given: number = 7;\nexport const level: Level = given;\n')).toEqual([]);
  });
});

describe('no-unset-capture', () => {
  const only = (found: ReturnType<typeof checkSafe>) => refusals(found).filter((refusal) => refusal.startsWith('no-unset-capture'));

  test('refuses a variable declared with no value that a function reads or writes', () => {
    const code = [
      'let ready: string;',
      'export const peek = (): string => ready;',
      'ready = "yes";',
      'let count: number;',
      'export function set(n: number): void {',
      '  count = n;',
      '}',
      '',
    ].join('\n');
    const found = checkSafe(code);
    expect(only(found)).toEqual(['no-unset-capture@1', 'no-unset-capture@4']);
    expect(found.find((d) => d.rule === 'no-unset-capture')?.message).toBe('This variable is declared with no value and a function uses it: nothing shows it has one when the function runs.');
  });

  test('accepts one that gets its value on the path the compiler follows', () => {
    const code = [
      'export const label = (n: number): string => {',
      '  let text: string;',
      '  if (n > 0) text = "more";',
      '  else text = "less";',
      '  return text;',
      '};',
      '',
    ].join('\n');
    expect(only(checkSafe(code))).toEqual([]);
  });

  test('accepts one whose type says it may have no value, and one that is given a value', () => {
    const code = [
      'let maybe: string | undefined;',
      'let given: string = "";',
      'export const read = (): string => `${maybe ?? ""}${given}`;',
      'export const write = (text: string): void => { maybe = text; given = text; };',
      '',
    ].join('\n');
    expect(only(checkSafe(code))).toEqual([]);
  });

  test('a function inside the one that declares it uses it too; the variable of a loop is not one', () => {
    const code = [
      'export const run = (items: readonly number[]): readonly (() => number)[] => {',
      '  let last: number;',
      '  const readers = items.map((item) => () => item);',
      '  for (const item of items) last = item;',
      '  for (let i: number = 0; i < 1; i++) readers.length;',
      '  return [...readers, () => last];',
      '};',
      '',
    ].join('\n');
    expect(only(checkSafe(code))).toEqual(['no-unset-capture@2']);
  });

  test('does not run in a test: the runner gives the value before each case', () => {
    const code = 'let dir: string;\nexport const use = (): number => dir.length;\n';
    expect(only(checkFiles({ 'src/a.test.ts': code }))).toEqual([]);
    expect(only(checkFiles({ 'src/a.ts': code }))).toEqual(['no-unset-capture@1']);
  });
});

describe('no-early-this', () => {
  const only = (code: string) => refusals(checkSafe(code)).filter((refusal) => refusal.startsWith('no-early-this'));

  test('refuses a method called in a constructor, and `this` handed over there', () => {
    const code = [
      'const register = (meter: Meter): number => meter.size;',
      'export class Meter {',
      '  readonly label: string;',
      '  readonly size: number;',
      '  constructor() {',
      '    this.label = this.render();',
      '    register(this);',
      '    this.size = 1;',
      '  }',
      '  render(): string {',
      '    return String(this.size);',
      '  }',
      '}',
      '',
    ].join('\n');
    const found = checkSafe(code).filter((d) => d.rule === 'no-early-this');
    expect(found.map((d) => `${d.start.line} ${d.message}`)).toEqual([
      '6 Method called while the object is being made: it can read a property that has no value yet.',
      '7 `this` handed over while the object is being made: whoever gets it can read a property that has no value yet.',
    ]);
  });

  test('refuses the same in the value a property is declared with', () => {
    const code = ['export class Meter {', '  readonly label = this.render();', '  readonly size = 1;', '  render(): string {', '    return String(this.size);', '  }', '}', ''].join('\n');
    expect(only(code)).toEqual(['no-early-this@2']);
  });

  test('accepts properties read and written, and a function that will run later', () => {
    const code = [
      'export class Meter {',
      '  readonly size: number;',
      '  readonly double: number;',
      '  readonly later: () => string;',
      '  readonly show = (): string => this.render();',
      '  constructor(size: number) {',
      '    this.size = size;',
      '    this.double = this.size * 2;',
      '    this.later = () => this.render();',
      '  }',
      '  render(): string {',
      '    return String(this.double);',
      '  }',
      '  twice(): string {',
      '    return this.render() + this.render();',
      '  }',
      '}',
      '',
    ].join('\n');
    expect(only(code)).toEqual([]);
  });
});

describe('no-unbound-method', () => {
  const only = (code: string) => refusals(checkSafe(code)).filter((refusal) => refusal.startsWith('no-unbound-method'));
  const meter = ['class Meter {', '  readonly unit = "m";', '  show(): string {', '    return this.unit;', '  }', '}', 'const meter = new Meter();'];

  test('refuses a method taken off its object: of a class, of an object, of the language', () => {
    const code = [
      ...meter,
      'export const show = meter.show;',
      'export const shown = ["a"].map(meter.show);',
      'const box = { size: 1, read() { return this.size; } };',
      'export const read = box.read;',
      'export const trim = "a".trim;',
      'export const settle = Promise.resolve;',
      '',
    ].join('\n');
    expect(only(code)).toEqual(['no-unbound-method@8', 'no-unbound-method@9', 'no-unbound-method@11', 'no-unbound-method@12', 'no-unbound-method@13']);
  });

  test('accepts a method that is called, bound, or wrapped, and a property that holds a function', () => {
    const code = [
      ...meter,
      'const holder = { read: (): number => 1 };',
      'export const a = meter.show();',
      'export const b = meter.show.bind(meter);',
      'export const c = (): string => meter.show();',
      'export const d = holder.read;',
      '',
    ].join('\n');
    expect(only(code)).toEqual([]);
  });

  test('accepts the functions that do not read `this`: those of a namespace, those held by a constructor', () => {
    const code = ['export const a = [1.5].map(Math.floor);', 'export const b = [1].filter(Number.isInteger);', 'export const c = Object.keys;', 'export const d = JSON.stringify;', ''].join('\n');
    expect(only(code)).toEqual([]);
  });
});

describe('the rules on mutable collections', () => {
  const only = (rule: string, lines: readonly string[]) =>
    refusals(checkSafe(['import type { Mut } from "@strict-ts/std";', ...lines, ''].join('\n'))).filter((refusal) => refusal.startsWith(rule));

  test('mut-exact refuses a value given where Mut of a wider type is asked, and accepts the same type or a fresh value', () => {
    const lines = [
      'const names: Mut<string[]> = ["a"];',
      'const wider: Mut<(string | number)[]> = names;',
      'const same: Mut<string[]> = names;',
      'const fresh: Mut<(string | number)[]> = ["a"];',
      'const add = (into: Mut<(string | number)[]>): void => { into.push(1); };',
      'add(names);',
      'add(fresh);',
      'export const all = [wider, same];',
    ];
    expect(only('mut-exact', lines)).toEqual(['mut-exact@3', 'mut-exact@7']);
  });

  test('mut-exact compares an optional place without its undefined, and still refuses a wider type there', () => {
    const lines = [
      'const note = (seen: Mut<string[]> = []): number => seen.push("a");',
      'const any = (seen?: Mut<(string | number)[]>): number => (seen === undefined ? 0 : seen.push(1));',
      'const names: Mut<string[]> = ["a"];',
      'export const same = note(names);',
      'export const wider = any(names);',
      'export const maybe: Mut<string[]> | undefined = names;',
    ];
    expect(only('mut-exact', lines)).toEqual(['mut-exact@6']);
  });

  test('mut-exact says nothing where no mutation is asked: read-only, a wider type is sound', () => {
    expect(only('mut-exact', ['const names: readonly string[] = ["a"];', 'export const wider: readonly (string | number)[] = names;'])).toEqual([]);
  });

  test('no-resize refuses a length that is assigned, a write by position, and a tuple that is resized', () => {
    const lines = [
      'const values: Mut<number[]> = [1];',
      'values.length = 3;',
      'values[5] = 1;',
      '[values[0], values[1]] = [2, 3];',
      'const pair: Mut<[number, number]> = [1, 2];',
      'pair.pop();',
      'pair.push(3);',
      'export const kept = [values, pair];',
    ];
    expect(only('no-resize', lines)).toEqual(['no-resize@3', 'no-resize@4', 'no-resize@5', 'no-resize@5', 'no-resize@7', 'no-resize@8']);
  });

  test('no-resize accepts what leaves no hole: push and splice on an array, a position of a tuple, a table, a typed array', () => {
    const lines = [
      'const values: Mut<number[]> = [1];',
      'values.push(2);',
      'values.splice(0, 1, 3);',
      'const pair: Mut<[number, number]> = [1, 2];',
      'pair[0] = 5;',
      'const table: Mut<Record<string, number>> = {};',
      'table["a"] = 1;',
      'const bytes = new Uint8Array(4);',
      'bytes[0] = 1;',
      'export const kept = [values, pair, table, bytes];',
    ];
    expect(only('no-resize', lines)).toEqual([]);
  });

  test('mut-exact: a type that names fewer properties is not a wider one; a property that takes more is', () => {
    const lines = [
      'type Player = { hp: number; name: string; readonly bag: { gold: number; note: string }; tags: { id: string }[] };',
      'declare const player: Mut<Player>;',
      'declare const squad: Mut<Player[]>;',
      'const heal = (blob: Mut<{ hp: number }>): void => { blob.hp = 1; };',
      'const rename = (blob: Mut<{ name: string | number }>): void => { blob.name = 1; };',
      'const pay = (blob: Mut<{ readonly bag: { gold: number } }>): void => { blob.bag.gold = 1; };',
      'const swap = (blob: Mut<{ bag: { gold: number } }>): void => { blob.bag = { gold: 1 }; };',
      'const each = (list: Mut<readonly { hp: number }[]>): void => { for (const one of list) one.hp = 1; };',
      'const fill = (list: Mut<{ hp: number }[]>): void => { list.push({ hp: 1 }); };',
      'heal(player);',
      'rename(player);',
      'pay(player);',
      'swap(player);',
      'each(squad);',
      'fill(squad);',
    ];
    expect(only('mut-exact', lines)).toEqual(['mut-exact@12', 'mut-exact@14', 'mut-exact@16']);
  });

  test('mut-exact refuses a property that can be written, asked for with a wider type, and accepts one that is read-only there', () => {
    const lines = [
      'class Cell<T> {',
      '  constructor(public value: Mut<T>) {}',
      '}',
      'interface Shown<T> { readonly value: T }',
      'const text = new Cell<string>("a");',
      'export const wider: Cell<string | number> = text;',
      'export const shown: Shown<string | number> = text;',
      'export const same: Cell<string> = text;',
    ];
    expect(only('mut-exact', lines)).toEqual(['mut-exact@7']);
  });

  test('no-resize refuses an element that is deleted and an array made from a length alone', () => {
    const lines = [
      'const values: Mut<number[]> = [1, 2];',
      'delete values[0];',
      'export const a: readonly number[] = Array.from<number>({ length: 2 });',
      'export const b: readonly number[] = Array.from({ length: 2 }, (_, index) => index);',
      'export const c: readonly string[] = Array.from("ab");',
    ];
    expect(only('no-resize', lines)).toEqual(['no-resize@3', 'no-resize@4']);
  });

  test('no-keyed-write refuses a write through a key that stands for several names, and accepts one name, a table, an array', () => {
    const lines = [
      'type Row = { readonly id: number; readonly label: string };',
      'export const put = <K extends keyof Row>(row: Mut<Row>, key: K, value: Row[K]): void => {',
      '  row[key] = value;',
      '};',
      'export const rename = (row: Mut<Row>): void => {',
      '  row["label"] = "b";',
      '};',
      'export const note = (table: Mut<Record<string, number>>, key: string): void => {',
      '  table[key] = 1;',
      '};',
    ];
    expect(only('no-keyed-write', lines)).toEqual(['no-keyed-write@4']);
  });
});

describe('the rules on a value that holds more than its type names', () => {
  const only = (rule: string, lines: readonly string[]) => refusals(checkSafe([...lines, ''].join('\n'))).filter((refusal) => refusal.startsWith(rule));
  const shown = ['type Prices = { readonly apple: number };', 'const raw = { apple: 1, note: "fresh" };', 'const prices: Prices = raw;'];

  test('no-open-read refuses Object.values and entries on named properties, and accepts a table and an array', () => {
    const lines = [
      ...shown,
      'export const a = Object.values(prices);',
      'export const b = Object.entries(prices);',
      'const table: Readonly<Record<string, number>> = { apple: 1 };',
      'export const c = Object.values(table);',
      'export const d = Object.entries([1, 2]);',
      'export const e = Object.keys(prices);',
    ];
    expect(only('no-open-read', lines)).toEqual(['no-open-read@4', 'no-open-read@5']);
  });

  test('no-open-read refuses a table made from a value with named properties, and accepts one written in place', () => {
    const lines = [
      ...shown,
      'export const table: Readonly<Record<string, number>> = prices;',
      'export const written: Readonly<Record<string, number>> = { apple: 1 };',
      'export const again: Readonly<Record<string, number>> = written;',
      'const sum = (of: Readonly<Record<string, number>>): number => Object.values(of).length;',
      'export const total = sum(prices) + sum(written);',
    ];
    expect(only('no-open-read', lines)).toEqual(['no-open-read@4', 'no-open-read@8']);
  });

  test('no-in-narrowing refuses `in` on a union, and accepts it on one type', () => {
    const lines = [
      'type Cat = { readonly meow: string };',
      'type Dog = { readonly bark: string };',
      'export const a = (pet: Cat | Dog): boolean => "meow" in pet;',
      'export const b = (pet: Dog): boolean => "meow" in pet;',
      'export const c = (pet: object): boolean => "meow" in pet;',
    ];
    expect(only('no-in-narrowing', lines)).toEqual(['no-in-narrowing@3']);
  });

  test('no-loose-spread refuses a spread after a property it does not name, and one that may fill a property that may be there', () => {
    const lines = [
      'type Entry = { readonly id: number; readonly other: number };',
      'type Options = { readonly name: string; readonly retries?: number };',
      'const extra = { id: "x", other: 1, name: "job", retries: "many" };',
      'const partial: { readonly other: number } = extra;',
      'const named: { readonly name: string } = extra;',
      'export const a: Entry = { id: 1, ...partial };',
      'export const b: Options = { ...named };',
      'export const c: Entry = { ...partial, id: 1 };',
      'export const d: Options = { ...named, retries: 2 };',
    ];
    expect(only('no-loose-spread', lines)).toEqual(['no-loose-spread@6', 'no-loose-spread@7']);
  });

  test('no-keyed-write accepts a write by position into a typed array', () => {
    const lines = [
      'export const fill = (bytes: Mut<Uint8Array>, cells: Mut<Float32Array>, at: number): void => {',
      '  bytes[at] = 1;',
      '  cells[at + 1] = 0.5;',
      '};',
    ];
    expect(only('no-keyed-write', lines)).toEqual([]);
  });

  test('no-keyed-write refuses a computed key that is not one name in an object that is not a table', () => {
    const lines = [
      'type Sizes = { readonly width?: number; readonly label?: string };',
      'const one = "width" as const;',
      'export const a = (key: "width" | "label", value: number | string): Sizes => ({ [key]: value });',
      'export const b = (key: string, value: number): Readonly<Record<string, number>> => ({ [key]: value });',
      'export const c: Sizes = { [one]: 1 };',
      'export const d = (key: string) => ({ [key]: 1 });',
      'export const e = { [Symbol.iterator]: () => [1][Symbol.iterator]() };',
    ];
    expect(only('no-keyed-write', lines)).toEqual(['no-keyed-write@3', 'no-keyed-write@6']);
  });

  test('no-loose-spread accepts the rest of a pattern for the names the pattern took out, when it is a constant', () => {
    const lines = [
      'type Router = { readonly rule?: string; readonly service?: string; readonly [key: string]: unknown };',
      'export const a = (base: Router, rule: string): Router => {',
      '  const { rule: _rule, "service": _service, ...rest } = base;',
      '  return { ...rest, ...(rule === "" ? {} : { rule }) };',
      '};',
      'export const b = (base: Router, other: Router): Router => {',
      '  let { rule: _rule, service: _service, ...rest } = base;',
      '  rest = other;',
      '  return { ...rest };',
      '};',
    ];
    expect(only('no-loose-spread', lines)).toEqual(['no-loose-spread@9']);
  });

  test('no-loose-spread accepts what names everything it copies: a value of the same type, an object written in place, a choice of two', () => {
    const lines = [
      'type Options = { readonly name: string; readonly retries?: number };',
      'const base: Options = { name: "a" };',
      'export const a: Options = { ...base, name: "b" };',
      'export const b: Options = { name: "c", ...{ retries: 1 } };',
      'export const c = (quick: boolean): Options => ({ name: "d", ...(quick ? {} : { retries: 3 }) });',
    ];
    expect(only('no-loose-spread', lines)).toEqual([]);
  });

  test('no-class-lookalike refuses an object given where a class is asked, and accepts one made by it or an interface', () => {
    const lines = [
      'class Tag {',
      '  readonly label = "tag";',
      '}',
      'interface Shown { readonly label: string }',
      'export const a: Tag = { label: "tag" };',
      'export const b: Tag = new Tag();',
      'export const c: Shown = { label: "tag" };',
      'export const d: Shown = new Tag();',
      'const size = (of: Tag | string): number => (of instanceof Tag ? 0 : of.length);',
      'const plain = { label: "tag" };',
      'export const e = size(plain) + size(b) + size("x");',
    ];
    expect(only('no-class-lookalike', lines)).toEqual(['no-class-lookalike@5', 'no-class-lookalike@11']);
  });
});

describe('no-stale-narrowing', () => {
  const only = (lines: readonly string[]) =>
    refusals(checkSafe(['import type { Mut } from "@strict-ts/std";', ...lines, ''].join('\n'))).filter((refusal) => refusal.startsWith('no-stale-narrowing'));

  test('refuses a narrowed read after a call: of a variable another function writes, of a property that can be written', () => {
    const lines = [
      'let current: string | number = "a";',
      'const reset = (): void => { current = 1; };',
      'export const a = (): string => {',
      '  if (typeof current !== "string") return "";',
      '  reset();',
      '  return current;',
      '};',
      'const box: Mut<{ value: string | undefined }> = { value: "x" };',
      'export const b = (): number => {',
      '  if (box.value === undefined) return 0;',
      '  reset();',
      '  return box.value.length;',
      '};',
      'export const c = async (wait: Promise<void>): Promise<number> => {',
      '  if (box.value === undefined) return 0;',
      '  await wait;',
      '  return box.value.length;',
      '};',
    ];
    expect(only(lines)).toEqual(['no-stale-narrowing@7', 'no-stale-narrowing@13', 'no-stale-narrowing@18']);
  });

  test('refuses a getter read as narrowed, with or without a call', () => {
    const lines = [
      'let asked = 0;',
      'const source = { get value(): string | undefined { asked += 1; return asked % 2 === 1 ? "x" : undefined; } };',
      'export const a = (): number => (source.value === undefined ? 0 : source.value.length);',
    ];
    expect(only(lines)).toEqual(['no-stale-narrowing@4']);
  });

  test('accepts a read with no call before it, a constant, a local nobody else writes, a property that cannot be written', () => {
    const lines = [
      'const box: Mut<{ value: string | undefined }> = { value: "x" };',
      'const fixed: { readonly value: string | undefined } = { value: "x" };',
      'const touch = (): void => { box.value = undefined; };',
      'export const a = (): number => (box.value === undefined ? 0 : box.value.length);',
      'export const b = (): number => {',
      '  const value = box.value;',
      '  if (value === undefined) return 0;',
      '  touch();',
      '  return value.length;',
      '};',
      'export const c = (): number => {',
      '  let local: string | undefined = box.value;',
      '  if (local === undefined) local = "";',
      '  touch();',
      '  return local.length;',
      '};',
      'export const d = (): number => {',
      '  if (fixed.value === undefined) return 0;',
      '  touch();',
      '  return fixed.value.length;',
      '};',
    ];
    expect(only(lines)).toEqual([]);
  });

  test('a write after the call is what the read relies on: filling a cache is accepted', () => {
    const lines = [
      'let cached: string | undefined;',
      'const load = (): string => "x";',
      'export const get = (): string => {',
      '  if (cached === undefined) cached = load();',
      '  return cached;',
      '};',
      'export const drop = (): void => { cached = undefined; };',
    ];
    expect(only(lines)).toEqual([]);
  });
});

describe('no-reject', () => {
  const only = (lines: readonly string[]) => refusals(checkSafe([...lines, ''].join('\n'))).filter((refusal) => refusal.startsWith('no-reject'));

  test('refuses the function that makes a promise fail, taken by the callback of its constructor', () => {
    const lines = [
      'export const a = new Promise<number>((_resolve, reject) => { reject(new Error("no")); });',
      'export const b = new Promise<number>((resolve, _reject) => { resolve(1); });',
      'export const c = new Promise<number>(function (resolve, fail) { resolve(1); void fail; });',
    ];
    expect(only(lines)).toEqual(['no-reject@1', 'no-reject@2', 'no-reject@3']);
  });

  test('accepts a promise that can only be resolved', () => {
    expect(only(['export const wait = (ms: number): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, ms); });'])).toEqual([]);
  });

  test('refuses a member named then, of an object and of a class, and accepts a type that names one', () => {
    const lines = [
      'export const a = { then: (ok: (value: number) => void): void => { ok(1); } };',
      'export class Later {',
      '  then(ok: (value: number) => void): void {',
      '    ok(1);',
      '  }',
      '}',
      'export class Stored {',
      '  readonly then = (ok: (value: number) => void): void => { ok(1); };',
      '}',
      'export type Thenable = { readonly then: (ok: (value: number) => void) => void };',
      'export const isThenable = (value: object): boolean => "then" in value;',
    ];
    expect(only(lines)).toEqual(['no-reject@1', 'no-reject@3', 'no-reject@8']);
  });
});

describe('no-throwing-call and what an unsafe directory hands over', () => {
  const unsafe = [
    'import { ok, type Result } from "@strict-ts/std";',
    '// SAFETY: what each of these does is the point of the test.',
    'export const read = (): Result<string, string> => ok("x");',
    'export const later = async (): Promise<Result<string, string>> => ok("x");',
    'export const raw = (): Result<string, string> => ok("x");',
    'export const api = { read: (): string => "x", safe: (): Result<string, string> => ok("x") };',
    'export class Reader {',
    '  read(): Result<string, string> {',
    '    return ok("x");',
    '  }',
    '  bare(): string {',
    '    return "x";',
    '  }',
    '}',
    'export const make = (): Result<Reader, string> => ok(new Reader());',
    'export const lazy = { get value(): string { return "x"; } };',
    '',
  ].join('\n');
  const said = (lines: readonly string[]) =>
    checkEverything({ 'src/unsafe/io.ts': unsafe, 'src/a.ts': ['import { api, lazy, later, make, read, Reader } from "./unsafe/io.js";', ...lines, ''].join('\n') })
      .filter((d) => d.rule === 'no-throwing-call' && d.file === 'src/a.ts')
      .map((d) => `${d.start.line} ${d.message}`);

  test('accepts a function, a method and an async function that return a Result', () => {
    expect(said(['export const a = read();', 'export const b = api.safe();', 'export const c = await later();', 'export const d = make().map((reader) => reader.read());'])).toEqual([]);
  });

  test('refuses a method that returns a bare value, a constructor, and a getter', () => {
    expect(said(['export const a = api.read();', 'export const b = new Reader();', 'export const c = make().map((reader) => reader.bare());', 'export const d = lazy.value;'])).toEqual([
      '2 This function is written in an unsafe directory and does not return a Result or an Option: it may throw.',
      '3 `Reader.new` builds a class written in an unsafe directory: its constructor may throw, and has no type to say so.',
      '4 `Reader.bare` is written in an unsafe directory and does not return a Result or an Option: it may throw.',
      '5 The getter `value` is written in an unsafe directory: reading it runs code that may throw.',
    ]);
  });

  test('inside an unsafe directory, and under attempt, nothing is said', () => {
    const inside = checkEverything({ 'src/unsafe/io.ts': unsafe, 'src/unsafe/other.ts': 'import { api } from "./io.js";\n// SAFETY: a test.\nexport const text = (): string => api.read();\n' });
    expect(inside.filter((d) => d.rule === 'no-throwing-call')).toEqual([]);
  });
});

describe('no-early-read', () => {
  const only = (lines: readonly string[]) => checkSafe([...lines, ''].join('\n')).filter((d) => d.rule === 'no-early-read').map((d) => `${d.start.line} ${d.message.split(':')[0]}`);

  test('refuses a function used above a variable it reads, directly or through another', () => {
    const lines = [
      'const read = (): number => later;',
      'function through(): number {',
      '  return read() + 1;',
      '}',
      'export const a = read();',
      'export const b = through();',
      'export const c = [1].map(read);',
      'const later = 1;',
      'export const d = read();',
    ];
    expect(only(lines)).toEqual([
      '5 `read` is used here, and reads `later`, which is declared further down',
      '6 `through` is used here, and reads `later`, which is declared further down',
      '7 `read` is used here, and reads `later`, which is declared further down',
    ]);
  });

  test('accepts a function that is only declared above what it reads, and one used inside another function', () => {
    const lines = ['const read = (): number => later;', 'export const soon = (): number => read();', 'const later = 1;', 'export const now = read();'];
    expect(only(lines)).toEqual([]);
  });

  test('accepts a function whose type is asked above what it reads: `typeof` in a type runs nothing', () => {
    const lines = ['const read = (): number => later;', 'export type Read = ReturnType<typeof read>;', 'export type Same = typeof read;', 'const later = 1;', 'export const now = read();'];
    expect(only(lines)).toEqual([]);
    // The operator `typeof` on a call is not a type: the call runs.
    expect(only(['const read = (): number => later;', 'export const kind = typeof read();', 'const later = 1;'])).toEqual([
      '2 `read` is used here, and reads `later`, which is declared further down',
    ]);
  });

  test('refuses the files that import each other in a circle, and accepts an import of types', () => {
    const cycle = (kind: string) =>
      checkFiles({
        'src/a.ts': `import ${kind}{ b } from "./b.js";\nexport const a = 1;\nexport type A = typeof b;\n`,
        'src/b.ts': 'import { a } from "./a.js";\nexport const b = a + 1;\n',
        'src/c.ts': 'import { b } from "./b.js";\nexport const c = b;\n',
      })
        .filter((d) => d.rule === 'no-early-read')
        .map((d) => d.file);
    expect(cycle('')).toEqual(['src/a.ts', 'src/b.ts']);
    expect(cycle('type ')).toEqual([]);
  });
});

describe('what no-early-this and no-stale-narrowing had left open', () => {
  test('a function given to a call in a constructor is refused when it uses `this`; one that is kept is not', () => {
    const code = [
      'export class Total {',
      '  readonly seen: readonly string[];',
      '  readonly later: () => string;',
      '  readonly unit: string;',
      '  constructor(parts: readonly number[]) {',
      '    this.seen = parts.map(() => typeof this.unit);',
      '    this.later = () => this.unit;',
      '    this.unit = "m";',
      '  }',
      '}',
      '',
    ].join('\n');
    expect(refusals(checkSafe(code)).filter((refusal) => refusal.startsWith('no-early-this'))).toEqual(['no-early-this@6']);
  });

  test('a narrowing made before a loop is not relied on in it when a turn makes a call', () => {
    const lines = [
      'import type { Mut } from "@strict-ts/std";',
      'const box: Mut<{ value: string | undefined }> = { value: "x" };',
      'const clear = (): void => { box.value = undefined; };',
      'export const a = (): number => {',
      '  let total = 0;',
      '  if (box.value === undefined) return 0;',
      '  for (const turn of [1, 2]) {',
      '    total += box.value.length + turn;',
      '    clear();',
      '  }',
      '  return total;',
      '};',
      'export const b = (): number => {',
      '  let total = 0;',
      '  if (box.value === undefined) return 0;',
      '  for (const letter of box.value) total += letter.length;',
      '  return total;',
      '};',
      '',
    ];
    expect(refusals(checkSafe(lines.join('\n'))).filter((refusal) => refusal.startsWith('no-stale-narrowing'))).toEqual(['no-stale-narrowing@8']);
  });
});

describe('the last known ways around guarantees 2 and 3', () => {
  const by = (rule: string, lines: readonly string[], options = {}) =>
    checkSafeEverything([...lines, ''].join('\n'), options)
      .filter((d) => d.rule === rule)
      .map((d) => d.start.line);

  test('no-early-read follows a `let` of the top of a file as it follows a constant', () => {
    expect(by('no-early-read', ['const read = (): number => later;', 'export const early = read();', 'let later = 1;', 'later += 1;'])).toEqual([2]);
  });

  test('no-default-on-undefined: a function with a default, given where undefined may be passed on purpose', () => {
    const lines = [
      'type Topic = "news" | "sport";',
      'const correct = (topic: Topic = "news"): Topic => topic;',
      'const plain = (topic: Topic | undefined): Topic => topic ?? "sport";',
      'export const a: (topic: Topic | undefined) => Topic = correct;',
      'export const b: (topic?: Topic) => Topic = correct;',
      'export const c: (topic: Topic | undefined) => Topic = plain;',
      'export const d = [undefined, "news" as const].map(correct);',
    ];
    expect(by('no-default-on-undefined', lines)).toEqual([4, 7]);
  });

  test('no-default-on-undefined: a default in an assignment by a pattern', () => {
    const lines = [
      'declare const given: { readonly topic: "news" | undefined; readonly size?: number; readonly inner: { readonly deep: string | undefined } };',
      'declare const list: readonly (number | undefined)[];',
      'let topic: "news" | undefined;',
      'let size: number;',
      'let deep: string;',
      'let first: number;',
      '({ topic = "news", size = 1 } = given);',
      '({ inner: { deep = "x" } } = given);',
      '[first = 0] = list;',
      'export const all = [topic, size, deep, first];',
    ];
    expect(by('no-default-on-undefined', lines)).toEqual([7, 8, 9]);
  });

  test('no-throwing-operator: a property of the page that throws when read, unless that is caught', () => {
    const page = { compilerOptions: { lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'] } };
    const lines = [
      'export const a = (): number => localStorage.length;',
      'export const b = (): boolean => typeof window.sessionStorage === "object";',
      'export const c = (): string => document.cookie;',
      'export const d = (): number => {',
      '  try {',
      '    return localStorage.length;',
      '  } catch {',
      '    return 0;',
      '  }',
      '};',
      'export const e = (localStorage: { readonly length: number }): number => localStorage.length;',
    ];
    expect(by('no-throwing-operator', lines, page)).toEqual([1, 2, 3]);
  });
});

describe('no-stale-narrowing: a read that is a test, and one that relies on nothing', () => {
  const at = (lines: readonly string[], file = 'src/a.ts') =>
    checkFiles({ [file]: [...lines, ''].join('\n') })
      .filter((d) => d.rule === 'no-stale-narrowing')
      .map((d) => d.start.line);
  const lines = [
    'import type { Mut } from "@strict-ts/std";',
    'type Kind = "archer" | "shade" | "boss";',
    'const foe: Mut<{ kind: Kind; awake: boolean }> = { kind: "archer", awake: false };',
    'const turn = (): void => { foe.kind = "boss"; foe.awake = true; };',
    'const name = (kind: Kind): string => kind;',
    'const only = (kind: "archer" | "shade"): string => kind;',
    'export function a(): string {',
    '  if (foe.kind === "boss") return "";',
    '  turn();',
    '  if (foe.kind === "shade") return "shade";',
    '  if (!foe.awake && foe.kind !== "archer") return "asleep";',
    '  const whole: Kind = foe.kind;',
    '  const told = name(foe.kind);',
    '  const narrowed = only(foe.kind);',
    '  const kept = foe.kind;',
    '  return `${whole}${told}${narrowed}${kept}`;',
    '}',
    'export function b(): string {',
    '  if (foe.kind === "boss") return "";',
    '  const size = Math.max(1, 2);',
    '  const still: "archer" | "shade" = foe.kind;',
    '  return `${size}${still}`;',
    '}',
  ];

  test('a comparison, a read for its truth and a place that takes the whole type are accepted; what relies on the narrowing is not', () => {
    // Line 15 relies on it as well; the refusal of line 14 is said once.
    expect(at(lines)).toEqual([14]);
  });

  test('a test that was accepted after a call does not make what follows it fresh', () => {
    const after = [...lines.slice(0, 6), 'export function c(): string {', '  if (foe.kind === "boss") return "";', '  turn();', '  if (foe.kind === "shade") return "";', '  const left: "archer" = foe.kind;', '  return left;', '}'];
    expect(at(after)).toEqual([11]);
  });

  test('a switch is a test when it has a default, and not when the compiler takes it for exhaustive', () => {
    const head = [...lines.slice(0, 6), 'export function d(): number {', '  if (foe.kind === "boss") return 0;', '  turn();', '  switch (foe.kind) {', '    case "archer":', '      return 1;', '    case "shade":', '      return 2;'];
    expect(at([...head, '  }', '}'])).toEqual([10]);
    expect(at([...head, '    default:', '      return 3;', '  }', '}'])).toEqual([]);
  });

  test('a test file reads a value after the call that changes it', () => {
    expect(at(lines, 'src/a.test.ts')).toEqual([]);
  });
});

describe('a name for a Mut type, imported', () => {
  const store = 'import type { Mut } from "@strict-ts/std";\nexport type Store = Mut<Map<string, Mut<Map<string, number>>>>;\nexport type Frozen = ReadonlyMap<string, ReadonlyMap<string, number>>;\n';
  const user = (type: string) =>
    `import type { ${type} } from "./store.js";\nexport function clear(store: ${type}, id: string): void {\n  const inner = store.get(id);\n  if (inner === undefined) return;\n  inner.delete("a");\n  store.delete(id);\n}\n`;
  const found = (type: string) =>
    checkEverything({ 'src/store.ts': store, 'src/a.ts': user(type) })
      .filter((d) => d.file === 'src/a.ts' && d.rule !== undefined)
      .map((d) => `${d.rule}:${d.start.line}`);

  test('says what it says where it is declared', () => {
    expect(found('Store')).toEqual([]);
  });

  test('a name for a read-only type, imported, is still read-only', () => {
    expect(found('Frozen').length).toBeGreaterThan(0);
  });
});

describe('no-unbound-method: a method that is written', () => {
  const lines = (body: string) => `class Run {\n  step = 0;\n  descend(): void {\n    this.step += 1;\n  }\n}\nexport function spy(run: Run): () => void {\n${body}\n}\n`;

  test('is not taken off its object', () => {
    expect(checkSafe(lines('  const before = run.descend.bind(run);\n  run.descend = () => before();\n  return before;')).filter((d) => d.rule === 'no-unbound-method')).toEqual([]);
  });

  test('read into a value, it still is', () => {
    expect(checkSafe(lines('  return run.descend;')).filter((d) => d.rule === 'no-unbound-method')).toHaveLength(1);
  });
});

describe('a parameter that is Mut, or nothing', () => {
  const found = (type: string) =>
    checkSafeEverything(`import type { Mut } from "@strict-ts/std";\ntype Cart = { total: number };\ntype Note = { text: string };\nexport function add(cart: ${type}): void {\n  if (cart !== undefined && "total" in cart) cart.total += 1;\n}\nexport type { Note };\n`)
      .filter((d) => d.rule === 'no-param-mutation')
      .map((d) => d.start.line);

  test('may be changed when there is one', () => {
    expect(found('Mut<Cart> | undefined')).toEqual([]);
    expect(found('(Mut<Cart>) | undefined')).toEqual([]);
  });

  test('a union with a member that does not say Mut is still read-only', () => {
    expect(found('Mut<Cart> | Cart')).toEqual([5]);
    expect(found('Cart | undefined')).toEqual([5]);
  });
});

describe('explicit mutability: what stays accepted', () => {
  const head = [
    'import type { Mut } from "@strict-ts/std";',
    'type Cart = { total: Mut<number> };',
    'const bump = (cart: Mut<Cart>): void => { cart.total += 1; };',
    'const reverse = <T>(list: Mut<T[]>): void => { list.reverse(); };',
  ];
  const found = (...lines: readonly string[]) =>
    checkSafeEverything([...head, ...lines, ''].join('\n'))
      .filter((d) => d.rule === 'no-param-mutation' || d.rule === 'mut-from-readonly')
      .map((d) => `${d.start.line} ${d.rule}`);

  test('what a function made, under a name or in a list of its own', () => {
    expect(found('export function mine(): Mut<Cart> {', '  const cart = { total: 1 };', '  bump(cart);', '  const list = [cart];', '  for (const one of list) bump(one);', '  list.forEach((one: Mut<Cart>) => { one.total = 0; });', '  return cart;', '}')).toEqual([]);
  });

  test('a new list of what a parameter holds, where `Mut<…>` is asked of the list only', () => {
    expect(found('export function sorted(carts: readonly Cart[]): readonly Cart[] {', '  const copy = [...carts];', '  reverse(copy);', '  copy.sort((x, y) => x.total - y.total);', '  return copy;', '}')).toEqual([]);
  });

  test('a list that says `Mut<…>` of what it holds: the elements are written, the list is not', () => {
    expect(found('export function zero(list: readonly Mut<Cart>[], carts: ReadonlyMap<string, Mut<Cart>>): void {', '  for (const cart of list) cart.total = 0;', '  for (const cart of carts.values()) bump(cart);', '}')).toEqual([]);
    expect(found('export function grow(list: readonly Mut<Cart>[]): void {', '  list.at(0);', '  const same: Mut<Cart[]> = [];', '  same.push(...list);', '}')).toEqual([]);
  });

  test('going through a list by hand, and making new things out of it', () => {
    expect(found('export function count(carts: readonly Cart[], names: ReadonlyMap<string, Cart>): number {', '  const first = carts[Symbol.iterator]().next();', '  const totals = carts.map((cart) => ({ total: cart.total }));', '  for (const one of totals) one.total += 1;', '  const keys = [...names.keys()];', '  keys.sort();', '  return first.done === true ? 0 : totals.length + keys.length;', '}')).toEqual([]);
  });

  test('what the library makes new: a list of texts, a clone', () => {
    expect(found('export function words(text: string, cart: Cart): readonly string[] {', '  const list = text.split(" ");', '  list.sort();', '  const keys = Object.keys(cart);', '  keys.reverse();', '  const copy = structuredClone(cart);', '  copy.total = 2;', '  return [...list, ...keys];', '}')).toEqual([]);
  });

  test('a method of the project keeps only what its parameter says may be written', () => {
    expect(
      found(
        'class Grid {',
        '  kinds: Mut<string[]> = [];',
        '  set(this: Mut<Grid>, tile: { readonly kind: string }): void { this.kinds.push(tile.kind); }',
        '  get(): { readonly kind: string } { return { kind: this.kinds[0] ?? "" }; }',
        '}',
        'const fill = (grid: Mut<Grid>): void => { grid.set({ kind: "x" }); };',
        'export function make(): number {',
        '  const grid = new Grid();',
        '  grid.set({ ...grid.get(), kind: "y" });',
        '  fill(grid);',
        '  return grid.kinds.length;',
        '}',
      ),
    ).toEqual([]);
  });

  test('a part that says itself read-only, inside a `Mut<…>`: it is given another list, and that list is not written', () => {
    const lines = ['export function keep(initial: readonly Cart[]): number {', '  const state: Mut<{ carts: readonly Cart[]; count: number }> = { carts: initial, count: 0 };', '  state.carts = [...initial];', '  state.count += 1;', '  return state.carts.length + state.count;', '}'];
    expect(found(...lines)).toEqual([]);
    expect(found(...lines.slice(0, 4), '  const first = state.carts[0];', '  if (first !== undefined) first.total = 0;', '  return 0;', '}')).toEqual(['10 no-param-mutation']);
  });

  test('an object that is chosen among the function\'s own, a function called by a key, a canvas of its own', () => {
    expect(found('export function pick(flag: boolean): number {', '  const x = { total: 1 };', '  const y = { total: 2 };', '  (flag ? x : y).total = 0;', '  const table = { double: (n: number): number => n * 2 };', '  return table["double"](x.total + y.total);', '}')).toEqual([]);
    expect(found('export function draw(ctx: Mut<CanvasRenderingContext2D>): void {', '  ctx.save();', '  ctx.fillRect(0, 0, 1, 1);', '  ctx.restore();', '}')).toEqual([]);
  });

  test('a function written in place that makes what it hands out, where one that says `Mut<…>` in its return type is asked', () => {
    expect(found('type Opens = { readonly open: () => Mut<Cart> };', 'export function make(): number {', '  const get: () => Mut<Cart> = () => ({ total: 1 });', '  const shop: Opens = { open: () => ({ total: 2 }) };', '  get().total += 1;', '  shop.open().total += 1;', '  return 0;', '}')).toEqual([]);
  });

  test('functions that say the same of `Mut<…>`, kept in a map, a promise, or given to one another', () => {
    expect(found('type Quiet = (cart: Cart) => number;', 'const read: Quiet = (cart) => cart.total;', 'const call = (f: Quiet, cart: Cart): number => f(cart);', 'export async function all(cart: Cart): Promise<number> {', '  const map: ReadonlyMap<string, Quiet> = new Map([["a", read]]);', '  const kept: Promise<Quiet> = Promise.resolve(read);', '  const run: (f: Quiet, cart: Cart) => number = call;', '  return run(await kept, cart) + (map.get("a")?.(cart) ?? 0);', '}')).toEqual([]);
  });

  test('a list of lists that says `Mut<…>` at each level', () => {
    expect(found('export function zero(grid: Mut<Mut<Mut<Cart>[]>[]>, rows: readonly (readonly Mut<Cart>[])[]): void {', '  for (const row of grid) for (const cell of row) cell.total = 0;', '  for (const row of rows) for (const cell of row) cell.total = 0;', '  const first = grid[0]?.[0];', '  if (first !== undefined) first.total = 1;', '  grid.push([]);', '}')).toEqual([]);
  });

  test('a table and a field of lists that say `Mut<…>` of what they hold', () => {
    expect(found('export class Grid {', '  rows: Mut<Mut<Mut<Cart>[]>[]> = [];', '  zero(this: Mut<Grid>): void {', '    for (const row of this.rows) for (const cell of row) cell.total = 0;', '  }', '}', 'export function wipe(carts: Mut<Record<string, Mut<Cart>>>): void {', '  const { first } = carts;', '  if (first !== undefined) first.total = 0;', '}')).toEqual([]);
  });

  test('lists that say `Mut<…>` at every level, gone into in one step; and a list under a property', () => {
    expect(found('type Grid = Mut<Mut<Mut<Cart>[]>[]>;', 'export function zero(grid: Grid, world: Mut<{ readonly carts: Mut<Mut<Cart>[]> }>): void {', '  for (const cell of grid.flat()) cell.total = 0;', '  const first = grid.at(0)?.at(0);', '  if (first !== undefined) first.total = 0;', '  const [[cell]] = grid;', '  if (cell !== undefined) cell.total = 0;', '  for (const cart of world.carts) cart.total = 0;', '  const own = [[{ total: 1 }]];', '  for (const one of own.flat()) one.total = 0;', '}')).toEqual([]);
  });

  test('one of several functions, called with what is the caller\'s own; functions that say the same, handed back', () => {
    expect(found('const read = (cart: Cart): number => cart.total;', 'export const same = (flag: boolean) => (flag ? read : read);', 'export function mine(flag: boolean): number {', '  const cart = { total: 1 };', '  const f = flag ? read : bump;', '  f(cart);', '  for (const g of [read, bump]) g(cart);', '  const made = [1].map(() => ({ total: 2 }));', '  for (const one of made) one.total = 0;', '  return same(flag)(cart);', '}')).toEqual([]);
  });

  test('a method that says `this: Mut<…>` hands out its parts', () => {
    expect(found('export class Store {', '  private readonly carts: Mut<Mut<Cart>[]> = [];', '  all(this: Mut<Store>): readonly Mut<Cart>[] { return [...this.carts]; }', '  first(this: Mut<Store>): Mut<Cart> | undefined { return this.carts[0]; }', '}')).toEqual([]);
  });
});

describe('explicit mutability: what another module made', () => {
  const state = 'import type { Mut } from "@strict-ts/std";\nexport const settings = { level: 1, tags: ["a"] };\nexport const open: Mut<{ level: number }> = { level: 1 };\nexport const raise = (): void => {\n  settings.level += 1;\n};\n';
  const user = 'import { open, settings } from "./state.js";\nexport function a(): void {\n  settings.level += 1;\n  settings.tags.push("b");\n}\nexport function b(): void {\n  open.level += 1;\n}\n';
  const found = checkEverything({ 'src/state.ts': state, 'src/a.ts': user })
    .filter((d) => d.rule === 'no-param-mutation')
    .map((d) => `${d.file}:${d.start.line}`);

  test('is not changed by who imports it, unless it says `Mut<…>` where it is exported; the module that made it may', () => {
    expect(found).toEqual(['src/a.ts:3', 'src/a.ts:4']);
  });

  test('what is put in a place it declares inside a `Mut<…>` has to be something to change', () => {
    const slot = 'import type { Mut } from "@strict-ts/std";\nexport type Cart = { total: Mut<number> };\nexport const slot: Mut<{ cart: Cart | undefined }> = { cart: undefined };\n';
    const user = 'import { slot, type Cart } from "./slot.js";\nexport function hold(cart: Cart): void {\n  slot.cart = cart;\n}\nexport function zero(): void {\n  if (slot.cart !== undefined) slot.cart.total = 0;\n}\n';
    expect(checkEverything({ 'src/slot.ts': slot, 'src/a.ts': user }).filter((d) => d.file === 'src/a.ts' && (d.rule === 'no-param-mutation' || d.rule === 'mut-from-readonly')).map((d) => `${d.rule}:${d.start.line}`)).toEqual(['mut-from-readonly:3']);
  });

  test('reached through a namespace, or as a static field of its class, it is still that module\'s', () => {
    const state = 'export const settings = { level: 1 };\nexport class Shop {\n  static shared = { total: 0 };\n  static bump(): void {\n    Shop.shared.total += 1;\n  }\n}\n';
    const user = 'import * as state from "./state.js";\nimport { Shop } from "./state.js";\nexport function a(): void {\n  state.settings.level = 2;\n}\nexport function b(): void {\n  Shop.shared.total = 1;\n}\n';
    expect(checkEverything({ 'src/state.ts': state, 'src/a.ts': user }).filter((d) => d.rule === 'no-param-mutation').map((d) => `${d.file}:${d.start.line}`)).toEqual(['src/a.ts:4', 'src/a.ts:7']);
  });

  test('a new list of its texts is nobody else\'s', () => {
    const names = 'export const NAMES: readonly string[] = ["a", "b"];\n';
    const taker = 'import type { Mut } from "@strict-ts/std";\nimport { NAMES } from "./names.js";\ntype Meta = { readonly names: Mut<string[]>; count: Mut<number> };\nconst grow = (meta: Mut<Meta>): void => {\n  meta.names.push("c");\n  meta.count += 1;\n};\nexport function make(): number {\n  const meta = { names: [...NAMES], count: 0 };\n  grow(meta);\n  return meta.count;\n}\n';
    expect(checkEverything({ 'src/names.ts': names, 'src/a.ts': taker }).filter((d) => d.rule === 'no-param-mutation' || d.rule === 'mut-from-readonly')).toEqual([]);
  });
});

describe('unread-sources', () => {
  const found = (lines: readonly string[], unreadSources: readonly string[], paths: Readonly<Record<string, string[]>> = {}) =>
    checkFiles({ 'src/a.ts': [...lines, ''].join('\n') }, { unreadSources, compilerOptions: { paths } })
      .filter((d) => d.rule === 'unread-sources' || d.rule === 'no-external-import' || d.rule.startsWith('TS'))
      .map((d) => `${d.file}:${d.start.line} ${d.rule}`)
      .toSorted();

  test('each source the compiler does not read is refused as a whole', () => {
    expect(found(['export const a = 1;'], ['src/Card.vue', 'pages/index.vue'])).toEqual(['pages/index.vue:1 unread-sources', 'src/Card.vue:1 unread-sources']);
    expect(found(['export const a = 1;'], [])).toEqual([]);
  });

  test('an import of one is not refused again as a dependency, nor as a module that is not found', () => {
    const lines = ['import Card from "./Card.vue";', 'import List from "@/parts/List.vue";', 'export const a = [Card, List].length;'];
    const paths = { '@/*': ['/strict-ts-fixture/src/*'] };
    expect(found(lines, ['src/Card.vue', 'src/parts/List.vue'], paths)).toEqual(['src/Card.vue:1 unread-sources', 'src/parts/List.vue:1 unread-sources']);
    // Without the files, the same imports are what they were: a dependency, and a module the compiler does not find.
    expect(found(lines, [], paths)).toEqual(['src/a.ts:1 TS2307', 'src/a.ts:2 TS2307', 'src/a.ts:2 no-external-import']);
  });

  test('a file that is not there is still not found', () => {
    expect(found(['import Missing from "./Missing.vue";', 'export const a = [Missing].length;'], ['src/Card.vue'])).toEqual(['src/Card.vue:1 unread-sources', 'src/a.ts:1 TS2307']);
  });
});

describe('no-throwing-call on arguments written in the call', () => {
  const said = (lines: readonly string[], assume?: readonly 'generated-receivers'[]) =>
    checkSafeEverything([...lines, ''].join('\n'), { config: { unsafeDirs: ['src/unsafe'], allowedImports: ['@strict-ts/std'], ...(assume === undefined ? {} : { assume }) } })
      .filter((d) => d.rule === 'no-throwing-call')
      .map((d) => `${d.start.line} ${d.message.replace(/, as seen with .*$/, '.')}`);

  test('a call without a receiver is run: it is accepted when it does not throw, as it is written', () => {
    expect(
      said([
        'export const a = new RegExp("^a+$", "i");',
        'export const b = new RegExp("(");',
        'export const c = BigInt("12") + BigInt(3);',
        'export const d = BigInt("1.5");',
        'export const e = JSON.parse("[1, 2]") === undefined;',
        'export const f = decodeURIComponent("%20") + decodeURIComponent("%");',
        'export const g = new Intl.DateTimeFormat("fr-FR", { day: "numeric" });',
        'export const h = new Intl.DateTimeFormat("fr-FR", { day: "sometimes" as "numeric" });',
      ]).map((line) => line.replace(/ (throws|is not in).*$/, '')),
    ).toEqual(['2 `RegExp.new`', '4 `BigInt`', '6 `decodeURIComponent`', '8 `DateTimeFormat.new`']);
  });

  test('a receiver written in the call is the receiver: the call is run as it is', () => {
    expect(said(['export const a = "x".repeat(300) + "ab".padStart(4, "-");', 'export const b = "x".repeat(-1);', 'const LIMIT = 2;', 'export const c = LIMIT.toFixed(1);']).map((line) => line.slice(0, 1))).toEqual(['2']);
  });

  test('a value the compiler does not know is not run', () => {
    expect(said(['export const a = (source: string): RegExp => new RegExp(source);', 'export const b = (flags: "g" | "i"): RegExp => new RegExp("a", flags);', 'export const c = (flags: "g" | "gg"): RegExp => new RegExp("a", flags);']).map((line) => line.slice(0, 1))).toEqual(['1', '3']);
  });

  const methods = [
    'const ZONE = "Europe/Paris";',
    'export const a = (price: number): string => price.toFixed(2);',
    'export const b = (price: number): string => price.toFixed(101);',
    'export const c = (when: Date): string => when.toLocaleDateString("fr-FR", { day: "numeric", timeZone: ZONE });',
    'export const d = (when: Date, long: boolean): string => when.toLocaleDateString("fr-FR", { year: long ? "numeric" : undefined });',
    'export const e = (when: Date): string => when.toISOString();',
    'export const f = (text: string): string => text.normalize("NFC") + text.normalize("XYZ" as "NFC");',
    'export const g = (count: number): string => count.toString(36);',
  ];

  test('a method is run on a list of receivers, which is not the receiver it will have: refused unless the project says so', () => {
    expect(said(methods).map((line) => line.slice(0, 1))).toEqual(['2', '3', '4', '5', '6', '7', '7', '8']);
  });

  test('with the assumption, what never threw on the list is accepted; what throws on one of them is not', () => {
    expect(said(methods, ['generated-receivers'])).toEqual([
      '3 `Number.toFixed` throws a RangeError.',
      // An invalid date is in the list.
      '6 `Date.toISOString` throws a RangeError.',
      '7 `String.normalize` throws a RangeError.',
    ]);
  });
});

describe('no-throwing-call on an argument that is not written', () => {
  const said = (lines: readonly string[], assume: readonly ('generated-arguments' | 'generated-receivers')[] = ['generated-arguments', 'generated-receivers']) =>
    checkSafeEverything([...lines, ''].join('\n'), { config: { unsafeDirs: ['src/unsafe'], allowedImports: ['@strict-ts/std'], assume } })
      .filter((d) => d.rule === 'no-throwing-call')
      .map((d) => `${d.start.line} ${d.message.replace(/, as seen with .*$/, '.')}`);
  const compared = [
    'export const a = (x: string, y: string): number => x.localeCompare(y, undefined, { numeric: true });',
    'export const b = (x: string, y: string): number => x.localeCompare(y, "fr");',
    'export const c = (x: string, y: string | undefined): number => x.localeCompare(y ?? "", "fr");',
  ];

  test('a text, a number or nothing is run on a list of them: what never threw is accepted', () => {
    expect(said(compared)).toEqual([]);
  });

  test('what throws on one value of the list is refused', () => {
    expect(
      said([
        'export const a = (x: string, y: string, locale: string): number => x.localeCompare(y, locale);',
        'export const b = (text: string, count: number): string => text.repeat(count);',
        'export const c = (text: string, form: string): string => text.normalize(form);',
        'export const d = (source: string): RegExp => new RegExp(source);',
        'export const e = (text: string, part: string): boolean => text.match(part) === undefined;',
        'export const f = (text: string): bigint => BigInt(text);',
        'export const g = (text: string): string => decodeURIComponent(text);',
      ]).map((line) => line.split(' ').slice(0, 2).join(' ')),
    ).toEqual(['1 `String.localeCompare`', '2 `String.repeat`', '3 `String.normalize`', '4 `RegExp.new`', '5 `String.match`', '6 `BigInt`', '7 `decodeURIComponent`']);
  });

  test('an argument whose type admits an object has no list: the call is refused', () => {
    expect(
      said([
        'export const a = (x: string, y: string, options: Intl.CollatorOptions): number => x.localeCompare(y, undefined, options);',
        'export const b = (x: string, y: string, locales: readonly string[]): number => x.localeCompare(y, locales);',
      ]).map((line) => line.slice(0, 1)),
    ).toEqual(['1', '2']);
  });

  test('it is a list and not the value: refused unless the project says so, and the receiver is another matter', () => {
    expect(said(compared, []).map((line) => line.slice(0, 1))).toEqual(['1', '2', '3']);
    expect(said(compared, ['generated-receivers']).map((line) => line.slice(0, 1))).toEqual(['1', '2', '3']);
    expect(said(compared, ['generated-arguments']).map((line) => line.slice(0, 1))).toEqual(['1', '2', '3']);
    // With a receiver that is written, the list of arguments is all that is taken on trust.
    expect(said(['export const a = (y: string): number => "a".localeCompare(y, "fr");'], ['generated-arguments'])).toEqual([]);
  });
});

describe('no-throwing-call on arguments given by `...list`', () => {
  const said = (lines: readonly string[]) =>
    checkSafeEverything([...lines, ''].join('\n'), { config: { unsafeDirs: ['src/unsafe'], allowedImports: ['@strict-ts/std'], assume: ['generated-arguments', 'generated-receivers'] } })
      .filter((d) => d.rule === 'no-throwing-call')
      .map((d) => `${d.start.line} ${d.message.replace(/, as seen with .*$/, '.')}`);

  test('how many arguments there are is not known: a function that throws from a number of them is refused', () => {
    expect(
      said([
        // One argument is written, and two are given: the second is a locale.
        'export const a = (x: string, pair: readonly [string, string]): number => x.localeCompare(...pair);',
        'export const b = (x: string): number => x.localeCompare(...(["b", "not a locale"] as const));',
        'export const c = (x: string, y: string): number => x.localeCompare(y);',
      ]),
    ).toEqual(['1 `String.localeCompare` throws a RangeError.', '2 `String.localeCompare` throws a RangeError.']);
  });

  test('nothing is run on what is not written as it is given', () => {
    expect(said(['export const a = (): string => String.fromCodePoint(...[65, 66]);', 'export const b = (): string => String.fromCodePoint(65, 66);']).map((line) => line.slice(0, 1))).toEqual(['1']);
  });
});

describe('no-throwing-call in a page', () => {
  const page = { compilerOptions: { lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'] } };
  const lines = [
    'export const a = (root: ParentNode, selector: string): Element | undefined => root.querySelector(selector) ?? undefined;',
    'export const b = (canvas: CanvasRenderingContext2D): void => canvas.fillRect(0, 0, 10, 10);',
    'export const c = (run: () => void): number => requestAnimationFrame(run) + setTimeout(run, 10);',
    'export const d = (element: Element): void => element.scrollIntoView();',
    'export const e = (context: AudioContext): OscillatorNode => context.createOscillator();',
  ];
  const said = (assume?: readonly ('attached-buffers' | 'dom-as-observed')[]) =>
    checkSafeEverything([...lines, ''].join('\n'), { ...page, config: { unsafeDirs: ['src/unsafe'], allowedImports: ['@strict-ts/std'], ...(assume === undefined ? {} : { assume }) } })
      .filter((d) => d.rule === 'no-throwing-call')
      .map((d) => `${d.start.line} ${d.message.replace(/, as seen with .*$/, '.')}`);

  test('a function of the DOM that was seen to throw is refused; one that was only seen not to is refused too, with that reason', () => {
    expect(said()).toEqual([
      '1 `ParentNode.querySelector` throws a SyntaxError.',
      '2 `CanvasRect.fillRect` was only seen not to throw (80 calls in a browser): nothing was read that says it cannot.',
      // `setTimeout` on the same line was judged by a person, and the runs did not contradict it.
      '3 `requestAnimationFrame` was only seen not to throw (80 calls in a browser): nothing was read that says it cannot.',
      '4 `Element.scrollIntoView` was only seen not to throw (80 calls in a browser): nothing was read that says it cannot.',
      '5 `BaseAudioContext.createOscillator` is not in the effects ledger: nothing shows that it does not throw.',
    ]);
  });

  test('a project may take what was observed as enough: what threw, and what was never run, stay refused', () => {
    expect(said(['dom-as-observed'])).toEqual([
      '1 `ParentNode.querySelector` throws a SyntaxError.',
      '5 `BaseAudioContext.createOscillator` is not in the effects ledger: nothing shows that it does not throw.',
    ]);
  });
});

describe('no-throwing-call on arguments written in a call into the DOM', () => {
  const page = { compilerOptions: { lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'] } };
  const said = (lines: readonly string[], assume: readonly 'dom-as-observed'[] = ['dom-as-observed']) =>
    checkSafeEverything([...lines, ''].join('\n'), { ...page, config: { unsafeDirs: ['src/unsafe'], allowedImports: ['@strict-ts/std'], assume } })
      .filter((d) => d.rule === 'no-throwing-call')
      .map((d) => `${d.start.line} ${d.message.replace(/, as seen with .*$/, '.')}`);

  test('a call whose written arguments have the shape that was run in a browser is accepted', () => {
    expect(
      said([
        'export const a = (el: Element): void => el.classList.add("hidden", "is-open");',
        'export const b = (el: Element): void => el.classList.remove("app--shake");',
        'export const c = (el: Element, on: boolean): void => { el.classList.toggle("is-climax"); void on; };',
        'export const d = (): HTMLElement => document.createElement("canvas");',
        'export const e = (el: Element): void => el.setAttribute("aria-hidden", "true");',
        'export const f = (el: Element): void => el.setAttribute("role", "status");',
        'export const g = (root: ParentNode): Element | undefined => root.querySelector("#menu") ?? undefined;',
        'export const h = (root: ParentNode): number => root.querySelectorAll("[data-move]").length;',
        `export const i = (el: Element): Element | undefined => el.closest('input, select, textarea, [role="dialog"]') ?? undefined;`,
        'export const j = (el: Element): boolean => el.matches("button.upgrade-btn > span");',
        'export const k = (g: CanvasGradient): void => g.addColorStop(0.55, "rgba(15,23,42,0.15)");',
      ]),
    ).toEqual([]);
  });

  test('every value a written argument can have must have the shape', () => {
    expect(
      said([
        'export const a = (el: Element, open: boolean): void => el.classList.add(open ? "is-open" : "is-closed");',
        'export const b = (el: Element, open: boolean): void => el.classList.add(open ? "is-open" : "");',
        'export const c = (g: CanvasGradient, hot: boolean): void => g.addColorStop(hot ? 0 : 1, hot ? "#f00" : "rgba(0,0,0,0)");',
        'export const d = (g: CanvasGradient, hot: boolean): void => g.addColorStop(hot ? 0 : 1.5, "#f00");',
      ]),
    ).toEqual(['2 `DOMTokenList.add` throws a SyntaxError.', '4 `CanvasGradient.addColorStop` throws a SyntaxError.']);
  });

  test('an argument that is not written, or has not the shape, leaves the call refused', () => {
    expect(
      said([
        'export const a = (el: Element, name: string): void => el.classList.add(name);',
        'export const b = (el: Element): void => el.classList.add("two words");',
        'export const c = (name: string): HTMLElement => document.createElement(name);',
        'export const d = (): HTMLElement => document.createElement("Not A Name");',
        // An attribute that runs or loads something: a page can make the browser refuse a text there.
        'export const e = (el: Element): void => el.setAttribute("onclick", "go()");',
        'export const f = (el: Element): void => el.setAttribute("src", "a.js");',
        // A pseudo-class is outside the shape: nothing is said of it.
        'export const g = (root: ParentNode): Element | undefined => root.querySelector("li:not(.a)") ?? undefined;',
        'export const h = (root: ParentNode): Element | undefined => root.querySelector("#1st") ?? undefined;',
        'export const i = (g: CanvasGradient): void => g.addColorStop(0, "tomato");',
        'export const j = (el: Element, names: readonly string[]): void => el.classList.add(...names);',
      ]).map((line) => line.split(' ')[0]),
    ).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  test('a text that is not written has the shape of a text: any text was given in the browser', () => {
    expect(
      said([
        'export const a = (el: Element, value: string): void => el.setAttribute("data-count", value);',
        'export const b = (el: Element, value: string | undefined): void => el.setAttribute("data-count", value ?? "");',
        'export const c = (el: Element, name: string, value: string): void => el.setAttribute(name, value);',
      ]).map((line) => line.slice(0, 1)),
    ).toEqual(['3']);
  });

  test('an answer built with a text and a status written in the call', () => {
    expect(
      said([
        'export const a = (text: string): Response => new Response(text, { status: 404 });',
        'export const b = (text: string): Response => new Response(text, { status: 200, headers: { "content-type": "application/json" } });',
        'export const c = (text: string, found: boolean): Response => new Response(text, { status: found ? 200 : 404 });',
        'export const d = (text: string): Response => new Response(text);',
        'export const e = (): Response => new Response();',
        // A status that is not written, one that says there is no body, a body that may have been read already.
        'export const f = (text: string, status: number): Response => new Response(text, { status });',
        'export const g = (text: string): Response => new Response(text, { status: 204 });',
        'export const h = (body: ReadableStream): Response => new Response(body, { status: 200 });',
        'export const i = (text: string, type: string): Response => new Response(text, { headers: { "content-type": type } });',
        'export const j = (text: string): Response => new Response(text, { status: 200, statusText: "Fine" });',
        'export const k = (given: readonly [string]): Response => new Response(...given);',
      ]).map((line) => line.split(' ')[0]),
    ).toEqual(['6', '7', '8', '9', '10', '11']);
  });

  test('a question asked of the person has no way to throw, and a date that is shown may not be one', () => {
    expect(
      said([
        'export const a = (text: string): boolean => confirm(text) && window.confirm(text);',
        'export const b = (format: Intl.DateTimeFormat): string => format.format();',
        'export const c = (format: Intl.DateTimeFormat, at: Date): string => format.format(at);',
      ]),
    ).toEqual(['3 `DateTimeFormat.format` throws a RangeError on a date that is not one.']);
  });

  test('it is something seen in a browser: only a project that takes that as enough is told', () => {
    expect(said(['export const a = (el: Element): void => el.classList.add("hidden");'], [])).toEqual(['1 `DOMTokenList.add` throws a SyntaxError.']);
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

describe('mut-from-readonly', () => {
  const prelude = [
    'import type { Mut } from "@strict-ts/std";',
    'export interface Order { readonly id: string; readonly total: number }',
    'export const reset = (order: Mut<{ id: string; total: number }>): void => { order.total = 0; };',
    'export const sum = (order: Order): number => order.total;',
  ];
  const said = (...lines: readonly string[]) =>
    checkSafeEverything([...prelude, ...lines, ''].join('\n'))
      .filter((d) => d.rule === 'mut-from-readonly')
      .map((d) => `${d.start.line - prelude.length} ${d.message}`);

  test('refuses a parameter that does not ask for mutation, handed to a function that does', () => {
    expect(
      said(
        'export const a = (order: { id: string; total: number }): void => reset(order);',
        'export const b = (box: { readonly order: { id: string; total: number } }): void => reset(box.order);',
      ),
    ).toEqual([
      '1 Parameter `order` is given where `Mut<…>` is asked for, and does not ask for mutation itself.',
      '2 Parameter `box` is given where `Mut<…>` is asked for, and does not ask for mutation itself.',
    ]);
  });

  test('wherever it is given: a property or an element of what is written in place, an assignment, a choice, a call', () => {
    expect(
      said(
        'declare const held: Order;',
        'type Open = { id: string; total: number };',
        'export const a: { readonly inner: Mut<Open> } = { inner: held };',
        'export const b: readonly Mut<Open>[] = [held];',
        'let c: Mut<Open> = { id: "x", total: 1 };',
        'c = held;',
        'let d = { id: "x", total: 1 };',
        'd = held;',
        'export const e: Mut<Open> = c.total > d.total ? held : c;',
        'const same = <T>(value: T): T => value;',
        'export const f: Mut<Open> = same(held);',
        'export const g: { readonly inner: Order } = { inner: held };',
        'let [h, i] = [1, 2];',
        'declare const pair: readonly [number, number];',
        '[h, i] = pair;',
        'export const j = h + i;',
      ),
    ).toEqual([
      '3 A value typed read-only (`id`, `total`) is given where `Mut<…>` is asked for: a write there would change what its holder was told cannot change.',
      '4 A value typed read-only (`id`, `total`) is given where `Mut<…>` is asked for: a write there would change what its holder was told cannot change.',
      '6 A value typed read-only (`id`, `total`) is given where `Mut<…>` is asked for: a write there would change what its holder was told cannot change.',
      '8 A value typed read-only (`id`, `total`) is assigned to a place that can be written: a write there would change what its holder was told cannot change.',
      '9 A value typed read-only (`id`, `total`) is given where `Mut<…>` is asked for: a write there would change what its holder was told cannot change.',
      '11 A value typed read-only (`id`, `total`) is given where `Mut<…>` is asked for: a write there would change what its holder was told cannot change.',
    ]);
  });

  test('a number, a text or a boolean is copied: given where `Mut<…>` is asked, it is nobody else\'s', () => {
    expect(
      said(
        'export class Clock {',
        '  now: Mut<number> = 0;',
        '  label: Mut<string | undefined> = undefined;',
        '  facing: Mut<"N" | "S"> = "N";',
        '  tick(this: Mut<Clock>, now: number, label: string, facing: "N" | "S"): void {',
        '    this.now = now;',
        '    this.label = label;',
        '    this.label = now > 0 ? undefined : label;',
        '    this.facing = facing;',
        '  }',
        '}',
      ),
    ).toEqual([]);
    expect(checkSafeEverything([...prelude, 'export class Clock {', '  label: Mut<string | undefined> = undefined;', '  set(this: Mut<Clock>, label: string): void {', '    this.label = label;', '  }', '}', ''].join('\n')).filter((d) => d.rule === 'mut-exact')).toEqual([]);
  });

  test('looks below the first level of what is given', () => {
    expect(
      said(
        'declare const box: { readonly order: Order };',
        'export const a: Mut<{ order: { id: string; total: number } }> = box;',
      ),
    ).toEqual(['2 A value typed read-only (`order`) is given where `Mut<…>` is asked for: a write there would change what its holder was told cannot change.']);
    expect(
      said(
        'declare const box: { order: Order };',
        'export const a: Mut<{ order: { id: string; total: number } }> = box;',
      ),
    ).toEqual(['2 A value typed read-only (`order.id`, `order.total`) is given where `Mut<…>` is asked for: a write there would change what its holder was told cannot change.']);
  });

  test('refuses a function that writes its parameter where one that does not is asked for, and a method that writes its receiver', () => {
    expect(
      said(
        'declare const held: Order;',
        'const through = (run: (order: Order) => void): void => run(held);',
        'through(reset);',
        'through(sum);',
        'const each = (run: (order: Mut<{ id: string; total: number }>) => void): void => run({ id: "x", total: 1 });',
        'each(reset);',
        'function clear(this: Mut<{ total: number }>): void { this.total = 0; }',
        'const frozen: { readonly total: number; readonly clear: typeof clear } = { total: 1, clear };',
        'frozen.clear();',
        'const open: Mut<{ total: number; clear: typeof clear }> = { total: 1, clear };',
        'open.clear();',
      ),
    ).toEqual([
      '3 A function whose parameter 1 asks for `Mut<…>` is given where one that does not is asked for: it will be called with what its caller was told cannot change.',
      '9 A value typed read-only (`total`) is given to a method that asks for `this: Mut<…>`: a write there would change what its holder was told cannot change.',
    ]);
  });

  test('refuses a value typed read-only where a mutable one is asked for', () => {
    expect(
      said(
        'declare const held: Order;',
        'export const a = (): void => reset(held);',
        'export const b: Mut<{ id: string; total: number }> = held;',
        'export const c = (): Mut<{ total: number }> => held;',
        'declare const frozen: Readonly<{ id: string; total: number }>;',
        'export const d = (): void => reset(frozen);',
      ),
    ).toEqual([
      '2 A value typed read-only (`id`, `total`) is given where `Mut<…>` is asked for: a write there would change what its holder was told cannot change.',
      '3 A value typed read-only (`id`, `total`) is given where `Mut<…>` is asked for: a write there would change what its holder was told cannot change.',
      '4 A value typed read-only (`total`) is given where `Mut<…>` is asked for: a write there would change what its holder was told cannot change.',
      '6 A value typed read-only (`id`, `total`) is given where `Mut<…>` is asked for: a write there would change what its holder was told cannot change.',
    ]);
  });

  test('accepts what is the giver\'s to change, and what nobody asked to change', () => {
    expect(
      said(
        'export const a = (order: Mut<{ id: string; total: number }>): void => reset(order);',
        'export const b = (): void => reset({ id: "a", total: 1 });',
        'export const c = (): void => { const mine: Mut<{ id: string; total: number }> = { id: "a", total: 1 }; reset(mine); };',
        'export const d = (order: Order): number => sum(order);',
        'export const e = (list: Mut<number[]>): void => { list.push(1); };',
        'export const f = (): void => { const list: Mut<number[]> = []; e(list); };',
      ),
    ).toEqual([]);
  });
});
