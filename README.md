# strict-ts

Make TypeScript and JavaScript as safe as Rust. A program accepted by strict-ts must not be able to fail for a reason
its types do not announce.

It is a checker, not a language: the code stays standard TypeScript that `tsc` compiles as is. `strict-ts` runs in
place of `tsc --noEmit`, reports the compiler's errors, and adds its own rules.

Nothing is published on npm yet: everything below runs from this repo.

## The five guarantees

Rust's safety rests on five guarantees. JavaScript already has one, memory, thanks to the garbage collector. strict-ts
brings the other four, one rule at a time. This table is the project's scoreboard.

| Rust guarantee | Equivalent in TS/JS | Status |
|---|---|---|
| Memory safety | The runtime's garbage collector | Acquired |
| Safe typing, nothing unchecked outside `unsafe` | No `any`, cast, `declare` or `@ts-ignore` outside `unsafe/`; a `// SAFETY:` reason inside | Prototype |
| No null, errors in the types | `Option`, `Result`, `no-throw`, `must-use` | Prototype |
| Explicit mutability | Types read-only unless they say `Mut<T>`, no mutation of parameters | Prototype |
| Ownership, no uncontrolled concurrent access | Single-use resources, state shared across `await` and workers | Research: nothing written |

« Prototype » means the rules exist and are tested, and known ways around them remain (see
[Known limits](#known-limits)). No guarantee is « Acquired » by strict-ts yet.

## What it looks like

Classic TypeScript, accepted by `tsc --strict`:

```ts
export function parseInvoice(json: string): Invoice {
  return JSON.parse(json) as Invoice;
}
```

```
invoice.ts:31:10 no-cast `as` cast forbidden.
  help: Use a type guard, `satisfies`, or validate the data in unsafe/.
invoice.ts:31:10 no-any This expression has type `any` (inferred).
  help: Move the call into unsafe/ and return a validated Result<unknown, E>.
```

Conforming: the call that can throw lives in an unsafe directory and returns a `Result`; the shape is proven by a
schema instead of asserted by a cast.

```ts
// src/unsafe/system.ts
export const parseJson = (text: string) => attempt((): unknown => JSON.parse(text), String);

// src/invoice.ts
export const parseInvoice = (json: string) => parseJson(json).andThen(Invoice.parse);
```

The whole example is in [`examples/invoice`](examples/invoice): the classic version is 58 lines and is refused 20
times; the conforming one is 39 lines. A test keeps both numbers.

## Try it

```sh
corepack enable        # once: gives pnpm
pnpm install
pnpm build

node packages/cli/dist/main.js -p examples/invoice/strict     # exit code 0, nothing reported
node packages/cli/dist/main.js -p examples/invoice/classic    # exit code 1, 20 refusals
```

`pnpm build` also writes the playground to `packages/playground/dist`: open `index.html` in a browser to edit five
scenarios and read their diagnostics. It needs no server and no network.

## The command line

```
strict-ts [options]

  -p, --project <path>   A tsconfig.json, or a directory that holds one (default: the current directory)
      --format <format>  text (default), json or sarif
      --output <file>    Write the report to a file instead of the standard output
      --update-baseline  Record the violations found in the baseline file, and exit with 0
      --no-baseline      Ignore the baseline file: refuse every violation
      --strict-baseline  Fail when the baseline allows more than what is found
  -h, --help             Show this help
```

| Exit code | Meaning |
|---|---|
| 0 | Nothing is refused |
| 1 | Something is refused |
| 2 | The project could not be checked: wrong arguments, unreadable `tsconfig.json`, `strict-ts.json` or baseline, no file |

A project that cannot be checked is never reported as safe.

The text output gives one line per refusal, `file:line:column rule message`, and a `help:` line below. `--format json`
prints one document, `{ "diagnostics": [...] }`. `--format sarif` prints a SARIF 2.1.0 log for code-scanning views.

One run checks one `tsconfig.json`: project references are not followed, so a monorepo runs the gate once per package
(see `pnpm check` in [`package.json`](package.json)).

## The rules

« Scope » says where a rule runs: `safe` is everything outside the unsafe directories, `unsafe` is inside them, `all`
is both, `project` is once for the whole project.

| Rule | Guarantee | Scope | What it asks |
|---|---|---|---|
| `no-any` | typing | safe | No `any`, written or inferred (`JSON.parse` for instance) |
| `no-cast` | typing | safe | No type assertion (`as T`, `<T>x`). `as const` and `satisfies` stay allowed |
| `no-non-null` | typing | safe | No non-null assertion `x!`, no definite assignment `x!: T` |
| `no-type-predicate` | typing | safe | No written type predicate (`x is T`, `asserts x is T`). The ones the compiler infers stay |
| `no-ambient` | typing | safe | No `declare`, and no declaration file of the project outside an unsafe directory |
| `no-external-import` | typing | safe | Dependencies (npm, `node:*`) are imported from an unsafe directory only |
| `no-ts-directive` | typing | all | No `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck`, unsafe directories included |
| `unsafe-boundary` | typing | unsafe | The functions an unsafe directory exports return `Result` or `Option`, and leak no `any` |
| `safety-comment` | typing | unsafe | An `any`, a cast, a `!`, a written predicate or a `declare` has `// SAFETY: <reason>` right above |
| `strict-compiler-options` | typing | project | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature` |
| `no-throw` | errors | safe | No `throw`: errors are values (`Result`) |
| `no-null` | errors | safe | No `null`, as a value or as a type. Comparing with `=== null` stays allowed |
| `must-use` | errors | all | A `Result`, an `Option` or a `Promise` is not ignored. To drop one on purpose: `void expr` |
| `exhaustive-switch` | errors | all | A `switch` covers every member of a finite union, or has a `default` |
| `no-param-mutation` | mutability | safe | A function does not change a parameter unless it is typed `Mut<T>` |
| `readonly-types` | mutability | safe | A written type is read-only (`readonly T[]`, `ReadonlyMap`, `readonly` properties) unless under `Mut<…>` |

The compiler's own errors are reported too, as `TS2322` and the like. There is no comment that silences a rule, by
design: what cannot conform goes to an unsafe directory with its reason, or to the baseline.

## Unsafe directories

`unsafe/` is to strict-ts what `unsafe` is to Rust: the only place where unchecked code may live. By default it is
`src/unsafe`. Inside, casts, `any`, `throw` and external imports are allowed, on two conditions:

- what the directory exports returns `Result` or `Option` (`unsafe-boundary`), so that an error can only cross as a
  value;
- each unchecked construct says why it holds:

```ts
// SAFETY: a non-null object that is not an array has string keys, and its values are read as unknown.
export const asRecord = (value: unknown): Option<Readonly<Record<string, unknown>>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? some(value as Readonly<Record<string, unknown>>) : none;
```

To wrap a whole dependency instead of writing its file by hand:

```sh
node packages/wrap/dist/main.js node:path -p packages/cli -o src/unsafe/path.ts
```

Every function of the module then returns a `Result`; a result of type `any` becomes `unknown`, one that may be null
or undefined an `Option`. Classes and objects with methods are not wrapped: the header of the generated file lists
them.

## Configuration

An optional `strict-ts.json` beside `tsconfig.json`. Every key is optional; an unknown key or rule name is an error.

```json
{
  "$schema": "./node_modules/@strict-ts/cli/strict-ts.schema.json",
  "unsafeDirs": ["src/unsafe"],
  "allowedImports": ["@strict-ts/std"],
  "rules": ["no-any", "no-cast"],
  "baseline": "strict-ts-baseline.json"
}
```

| Key | Default | Meaning |
|---|---|---|
| `unsafeDirs` | `["src/unsafe"]` | The unsafe directories, relative to the directory of `tsconfig.json` |
| `allowedImports` | `["@strict-ts/std"]` | The packages safe code may import |
| `rules` | all | The rules to run |
| `baseline` | `strict-ts-baseline.json` | Where the baseline is read and written |
| `$schema` | none | The JSON schema, for completion and validation in the editor |

## Adopting it on existing code: the baseline

```sh
strict-ts --update-baseline     # records today's violations, exits with 0
strict-ts                       # from now on, fails only on what goes beyond the record
strict-ts --strict-baseline     # in CI: also fails when the record allows more than what is found
```

The baseline is a count per rule per file, sorted, so that it merges without conflicts and does not move when code
moves inside a file:

```json
{
  "version": 1,
  "files": {
    "src/billing/invoice.ts": { "no-any": 3, "no-throw": 1 }
  }
}
```

- A file and rule that hold more violations than recorded are refused whole, each with « n allowed by the baseline ».
- A fixed violation leaves a stale entry: a warning, or a failure with `--strict-baseline`, so the record only shrinks.
- The compiler's own errors are never recorded.
- The summary line reads `0 new, 8 baselined, 0 stale, 0 files out of the baseline`.

## In the editor

A TypeScript language service plugin shows the same refusals as you type. In `tsconfig.json`:

```json
{ "compilerOptions": { "plugins": [{ "name": "@strict-ts/language-service" }] } }
```

What the baseline allows is shown as a warning, what goes beyond it as an error. The plugin API exists up to
TypeScript 6: the editor must use the workspace's TypeScript, not a native TypeScript 7 server. It is tested against
the language service API, and has not been tried in an editor yet.

## The standard library

`@strict-ts/std` is what conforming code is written with. It is a runtime library and does not depend on the checker.

```ts
import { attempt, err, type Mut, ok, Option, panic, Result, s } from '@strict-ts/std';
```

| | |
|---|---|
| `Result<T, E>` | `ok(value)`, `err(error)`; `.map`, `.mapErr`, `.andThen`, `.unwrapOr`, `.match`; `if (r.ok)` narrows |
| `Result.gen` | Rust's `?` operator: `const x = yield* r` gives the value or leaves with the error. Works with `async function*` |
| `attempt(fn, onError)` | For unsafe code: turns an exception or a rejected promise into an `Err` |
| `Option<T>` | `Option.from(value)`, `some`, `none`; `.map`, `.andThen`, `.unwrapOr`, `.okOr`, `.match` |
| `s` | Schemas: `s.object`, `s.array`, `s.literal`, `s.optional`, `s.string`, `s.number`, `s.boolean`, `s.date`; `s.Infer<typeof X>` gives the type, read-only |
| `panic(message)`, `unreachable(value)` | For bugs, which are not domain errors: they stop the program |
| `Mut<T>` | Asks for mutation: Rust's `&mut`, read at the signature |

## Packages

| Package | Role | State |
|---|---|---|
| [`@strict-ts/core`](packages/core) | The rule engine, with no dependency on Node or on a TypeScript version | 16 rules, TypeScript 6 provider |
| [`@strict-ts/cli`](packages/cli) | The CI gate | text, JSON and SARIF output, `strict-ts.json`, baseline; no incremental cache |
| [`@strict-ts/std`](packages/std) | The runtime library of conforming code | `Result`, `Option`, schemas, `panic`, `Mut` |
| [`@strict-ts/wrap`](packages/wrap) | Generates the `unsafe/` wrapper of a dependency | functions and constants; classes and objects left out |
| [`@strict-ts/language-service`](packages/language-service) | The refusals in the editor | plugin tested outside an editor |
| [`@strict-ts/playground`](packages/playground) | strict-ts in the browser, on five scenarios; not published | builds to one page |
| `@strict-ts/codemod` | Automatic fixes and migration of existing code | not started |
| `@strict-ts/flow` | Flow analysis: single use, mutations across `await` | not started |

## Known limits

strict-ts refuses when it is not sure, but these are accepted today although the types do not cover them:

- A function of the JavaScript library that throws (`decodeURIComponent`, `BigInt("x")`) can be called from safe code:
  `no-throw` sees the `throw` keyword, not a call that throws.
- `unsafe-boundary` checks exported functions, not the methods of an exported object or class.
- Inferred types are not read by `readonly-types`: `const xs = [1, 2]` is a mutable local.
- A source file of the program outside the directory of `tsconfig.json` is compiled but not checked.
- A declaration file inside an unsafe directory is accepted whole.
- Only the TypeScript 6 API is supported.

## Working on it

```sh
pnpm lint && pnpm build && pnpm test && pnpm check
```

`pnpm check` runs strict-ts on its own packages, as the CI does. All pass with nothing recorded, except `std`, whose
baseline can only shrink. Build before testing: the adapters' tests load the built packages.

Node ≥ 22.13. The work (backlog, milestones), the specs and one RFC page per rule are in Plane, project
[STS](https://plane.adserver.fr/alex/projects/2c1f2990-e14d-4f3d-9186-ebbe292b8c8f/issues/); this repo holds the code,
the pull requests and the CI. A new rule starts with its RFC: the guarantee it serves, one refused example and its
fix, the cost in lines measured on the examples, the known false positives.

## License

MIT.
