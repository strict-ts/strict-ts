<p align="center"><img src="assets/logo.svg" alt="strict-ts" width="320"></p>

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
| No null, errors in the types | `Option`, `Result`, `no-throw`, `must-use`; a call or an operator that may throw is caught where it is written | Prototype |
| Explicit mutability | Types read-only unless they say `Mut<T>`, no mutation of parameters | Prototype |
| Ownership, no uncontrolled concurrent access | A value typed `Once<T>` has one owner and is given away exactly once (`use-once`). State shared across `await` and workers: nothing yet | Research: a first rule, on a small subset |

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

The whole example is in [`examples/invoice`](examples/invoice): the classic version is 58 lines and is refused 22
times; the conforming one is 39 lines. A test keeps both numbers.

## Examples

Four small programs, each written twice, classic and conforming, compiled, checked and run by the tests:
[`examples/`](examples).

| Example | About |
|---|---|
| [`invoice`](examples/invoice) | Typing and errors: the challenge above, 58 lines against 39 |
| [`report`](examples/report) | What throws without saying so: `JSON.parse`, a pattern, a bigint division, a template |
| [`cart`](examples/cart) | Explicit mutability: who changes what, and a pure directory |
| [`transfer`](examples/transfer) | Ownership: a transaction with one owner |

## Try it

```sh
corepack enable        # once: gives pnpm
pnpm install
pnpm build

node packages/cli/dist/main.js -p examples/invoice/strict     # exit code 0, nothing reported
node packages/cli/dist/main.js -p examples/invoice/classic    # exit code 1, 22 refusals
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
      --cache            Check only the files that changed since the last run, or that import one that did
      --timing           Say how many files were checked, and in how long
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

`--cache` keeps the result of each file in `node_modules/.cache/strict-ts/cache.json` and checks again only the files
whose text changed, or that import, directly or not, a file that did. A change of configuration, of compiler options,
of a dependency or of a file that declares globals spares nothing. On a generated project of 124,000 lines in 1,000
files, a run takes 11 to 17 s without it and 3 s with it when nothing or one leaf file changed.

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
| `no-overload` | typing | safe | No overload signature: nothing checks that the implementation keeps each promise, and one can be a cast |
| `no-method-signature` | typing | safe | No method syntax in an interface or a type (`name(x: T): R`): written `name: (x: T) => R`, it is compared soundly |
| `no-numeric-enum` | typing | safe | No enum with a member that is a number: any number is accepted where one is asked for. An enum of texts stays |
| `no-unset-capture` | typing | safe | A variable declared with no value (`let ready: string;`) is not used by a function: nothing shows it has a value when the function runs |
| `no-early-read` | errors | safe | A value is not read before its line: no function is used at the top of a file above a variable it reads, and files do not import each other in a circle |
| `no-reject` | errors | safe | A promise is not made to fail: the callback of `new Promise` does not take the function that rejects it, and no object has a `then` of its own |
| `no-stale-narrowing` | typing | safe | What a test narrowed is not relied on after a call or an `await` that could change it (a `let` another function writes, a property that can be written), nor on a getter |
| `no-class-lookalike` | typing | safe | Where a class is asked for, the value is made by that class, not an object of its shape |
| `no-loose-spread` | typing | safe | A spread does not write a property its type does not name: over one written before it, or into one the result may have |
| `no-in-narrowing` | typing | safe | `in` does not choose between the members of a union: a tag does |
| `no-open-read` | typing | safe | `Object.values` and `Object.entries` read a table (`Record`) only, and a table is not made from a value with named properties: it may hold more than its type names |
| `no-keyed-write` | typing | safe | A property is written through a key only when the key is one name |
| `no-resize` | typing | safe | An array gets no hole and a tuple keeps its length: no assignment to `length`, no write by position (`splice(i, 1, v)`), no `push` or `pop` on a tuple |
| `mut-exact` | typing | safe | What is given where `Mut<…>` is asked for has exactly that type: a `Mut<string[]>` is not a `Mut<(string \| number)[]>` |
| `no-unbound-method` | typing | safe | A method is called through its object: taken off it as a value it loses `this` |
| `no-early-this` | typing | safe | In a constructor or in the value of a property, no method of `this` is called and `this` is not handed over: the object is not complete |
| `no-ambient` | typing | safe | No `declare`, and no declaration file of the project outside an unsafe directory |
| `no-external-import` | typing | safe | Dependencies (npm, `node:*`) are imported from an unsafe directory only |
| `no-ts-directive` | typing | all | No `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck`, unsafe directories included |
| `unsafe-boundary` | typing | unsafe | The functions an unsafe directory exports return `Result` or `Option`, and leak no `any` |
| `safety-comment` | typing | unsafe | An `any`, a cast, a `!`, a written predicate or a `declare` has `// SAFETY: <reason>` right above |
| `strict-compiler-options` | typing | project | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature` |
| `unread-sources` | typing | project | A source the gate does not read (`.vue`, `.svelte`, `.astro`) is refused as a whole: nothing in it is checked |
| `no-throw` | errors | safe | No `throw`: errors are values (`Result`) |
| `no-null` | errors | safe | No `null`, as a value or as a type. Comparing with `=== null` stays allowed |
| `must-use` | errors | all | A `Result`, an `Option` or a `Promise` is not ignored. To drop one on purpose: `void expr` |
| `exhaustive-switch` | errors | all | A `switch` covers every member of a finite union, or has a `default` |
| `no-throwing-call` | errors | all | A call that may throw without its type saying so (a library function the effects ledger does not show to be safe, any function of a package that is not allowed) is made inside `attempt`, or in a `try` with a `catch` |
| `no-throwing-operator` | errors | all | An operator or a read that may throw on what its operands may be (a bigint `/`, `%` or `**`, the conversion of a value that is not plain in a template, a `+` or a comparison, an array length that is not a literal, a property of the library that runs code) is written in a `try` with a `catch` |
| `freeze-fresh` | errors | all | `Object.freeze`, `seal` and `preventExtensions` are given a value where it is made (a literal, a `new`), so that no name still says it can be changed |
| `use-once` | ownership | all | A value typed `Once<…>` has one owner: it is used through its members, given away exactly once (to a parameter or a return type that is `Once<…>`), and never lost. Giving it away in a loop, a `try`, a condition inside an expression or a closure is refused |
| `no-param-mutation` | mutability | safe | A function does not change a parameter unless it is typed `Mut<T>` |
| `mut-from-readonly` | mutability | safe | What is given where `Mut<…>` is asked for (an argument, an initializer, a returned value) is the giver's to change: not a parameter that does not ask for mutation itself, not a value typed read-only |
| `readonly-types` | mutability | safe | A written type is read-only (`readonly T[]`, `ReadonlyMap`, `readonly` properties) unless under `Mut<…>` |
| `pure-domain` | mutability | safe | In a directory listed in `pureDirs`: no clock, randomness, console, network or module-level state, and no import from outside the pure directories |

The compiler's own errors are reported too, as `TS2322` and the like. There is no comment that silences a rule, by
design: what cannot conform goes to an unsafe directory with its reason, or to the baseline.

## How strict-ts knows what throws

`no-throw` forbids writing `throw`. That is not enough: `JSON.parse(text)`, `new RegExp(source)`, `1n / 0n` and
`` `${value}` `` throw too, and their types do not say so. Two rules cover what a program calls and computes.

```
src/price.ts:4:10 no-throwing-call `Number.toFixed` throws a RangeError, as seen with -2147483648 · (2147483648).
src/price.ts:9:22 no-throwing-call `fetchRates` is declared in "rates-client", whose types do not say whether it throws.
src/price.ts:12:18 no-throwing-operator `/` throws a RangeError, as seen with 0n / 0n.
src/price.ts:15:31 no-throwing-operator A template throws a TypeError, as seen with `${Object.create(null)}`.
```

Each is accepted inside `attempt(() => …, onError)` or a `try` with a `catch`: the failure then becomes a `Result`.

What a function of the standard library does is not a list someone wrote. It is derived, by
[`packages/ledger`](packages/ledger), from two readings that must agree:

| | How | What it gives |
|---|---|---|
| **Runs** | Each of 802 functions is called 600 times on values generated from the types of its parameters | « It threw, on this call », or « it never threw » |
| **The specification** | The ECMAScript specification is read, every `throw` and every failure handed on; where each value comes from is followed, and each check is asked of the declared types | « It has a way to throw », or « it has none » |

A function is called safe only when the specification gives it no way to throw **and** no run threw. It throws when
either says so. When the two disagree the other way (it threw, and the reading says it cannot), the build of the
ledger fails until the case is understood and written down. The operators are run the same way, on every pair of
kinds of operand, and only the combinations the compiler accepts are kept.

The DOM has no specification that can be read that way, so its functions are only run, in a browser: 764 were seen
to throw (`querySelector("")`, `createElement` on a name that is not one), and are refused like any other. 700 never
threw: that is not a proof, so they are refused too, unless the project writes `"assume": ["dom-as-observed"]`.
With that line, a function seen to throw is also accepted on arguments that are written in the call and have a
shape that was run in a browser: `classList.add("hidden")`, `querySelector("#menu")`, `createElement("canvas")`.

**Arguments written in the call.** `new RegExp('^a+$')`, `BigInt('12')` and `JSON.parse('{}')` throw on some
arguments, and not on these. When the compiler knows every argument (a literal, a constant, an object of those), the
gate runs the call and accepts it if it does not throw. A method on a receiver that is not written, `price.toFixed(2)`
or `date.toLocaleDateString('fr-FR')`, is run on a list of receivers of its class: that is accepted only when the
project writes `"assume": ["generated-receivers"]`.

A function that is not in the ledger is refused: Node, the parts of the DOM a bare page cannot run (audio, WebGL,
service workers), a package that is not in `allowedImports`.

## Ownership: a value with one owner

A transaction that is neither committed nor rolled back, a lock released twice, a handle used after it was closed:
all compile. `Once<T>` marks a value that has one owner and is given away exactly once, as a value Rust moves.

```ts
import { end, type Once } from '@strict-ts/std';

export function begin(): Once<Transaction> { … }
export function commit(tx: Once<Transaction>): Result<void, DbError> { const raw = end(tx); … }

const tx = begin();
tx.query('…');                        // used through its members: fine
if (failed) return err('failed');     // refused: `tx` is not given away before this `return`
commit(tx);
tx.query('…');                        // refused: `tx` is used after it was given away
```

The rule `use-once` accepts a small subset, which it can prove: a value given away in plain sequence, or in both
branches of an `if`. In a loop, a `try`, a condition inside an expression or a closure, it refuses rather than guess.

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
  "pureDirs": ["src/domain"],
  "rules": ["no-any", "no-cast"],
  "baseline": "strict-ts-baseline.json"
}
```

| Key | Default | Meaning |
|---|---|---|
| `unsafeDirs` | `["src/unsafe"]` | The unsafe directories, relative to the directory of `tsconfig.json` |
| `allowedImports` | `["@strict-ts/std"]` | The packages safe code may import; their functions are trusted not to throw. `react` covers `@types/react` |
| `pureDirs` | none | The directories whose code must be pure (rule `pure-domain`) |
| `testDirs` | `["test", "tests"]` | The directories that hold tests. A file named `*.test.*` or `*.spec.*`, or under `__tests__`, is a test wherever it is. A test is checked like any code, except that it may throw, call what throws and import what it needs |
| `assume` | none | What the project says of itself and that no rule can check. `attached-buffers`: no buffer is ever detached, so typed arrays and `DataView` do not throw for that. `dom-as-observed`: a function of the DOM that never threw when it was run in a browser is taken not to throw. `generated-receivers`: a method whose arguments are written in the call, and that did not throw on a list of receivers, is taken not to throw |
| `rules` | all | The rules to run |
| `baseline` | `strict-ts-baseline.json` | Where the baseline is read and written |
| `$schema` | none | The JSON schema, for completion and validation in the editor |

## Adopting it on existing code

Run on six applications that were not written for it (4,400 to 29,800 lines: Hono, Next, Nuxt, Three.js, two canvas
games), strict-ts refuses from 9 to 35 places per 100 lines. In order of what it takes:

1. **Allow your frameworks.** A call into a package strict-ts knows nothing of is refused. List the ones you trust in
   `allowedImports`: `"react"` also covers `@types/react`.
2. **Tests need nothing.** A file under `test/` or `tests/`, named `*.test.*` or `*.spec.*`, or under `__tests__`, may
   throw, call what throws and import what it needs. Everything else is checked in it.
3. **Record the rest** in a baseline (below), so that the gate only fails on what is new.
4. **Let the fixer shrink it.** On a 17,400-line game it fixed 709 of 867 `readonly-types` refusals. It is slow: 16
   minutes there.
5. **By hand**: `null`, `!`, casts, and what throws.

For a browser application, `"assume": ["dom-as-observed"]` accepts the functions of the DOM that never threw when
they were run in a browser: 378 of the calls refused in the six applications. It also accepts eleven that do
throw, on harmless arguments written in the call (`classList.add("hidden")`): 134 more. What stays refused whatever you do:
61 calls into what a bare page cannot run (audio, service workers, `Intl`), and calls into Node unless `"node"` is
in `allowedImports`.

### The baseline

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

To shrink the record without doing it by hand, `strict-ts-fix` applies the fixes that are mechanical:

```sh
node packages/codemod/dist/main.js -p . --dry-run    # says what it would change
node packages/codemod/dist/main.js -p .              # writes it
```

It adds `readonly` to arrays and properties, writes `ReadonlyMap`, `ReadonlySet` and `Readonly<Record<…>>`, and removes
a written type predicate where the compiler infers it. Each fix is kept only if the project still compiles: what the
code really changes is left as it is, and listed.

About the baseline itself:

- A file and rule that hold more violations than recorded are refused whole, each with « n allowed by the baseline ».
- A fixed violation leaves a stale entry: a warning, or a failure with `--strict-baseline`, so the record only shrinks.
- The compiler's own errors are never recorded.
- The summary line reads `0 new, 8 baselined, 0 stale, 0 files out of the baseline`.

## In the editor

In VS Code, and the editors built on it, install the extension the repo builds:

```sh
pnpm build
code --install-extension packages/vscode/dist/strict-ts.vsix
```

Reload the window, and open a project that has a `strict-ts.json` beside its `tsconfig.json` (an empty `{}` is
enough): the same refusals as the gate are underlined as you type. In a project without that file the extension
shows nothing. What the baseline allows is a warning, what goes beyond it an error.

The extension holds no rule: it hands a TypeScript language service plugin to the TypeScript the editor runs, which
must be 6 or earlier. A native TypeScript 7 server has no plugin API. The plugin was tried against a real TypeScript
5.9 server started as the editor starts it; the extension itself has not been opened in an editor yet.

Another editor that runs `tsserver` can name the plugin in `tsconfig.json`, when the workspace has its own
TypeScript 6 with the plugin beside it:

```json
{ "compilerOptions": { "plugins": [{ "name": "@strict-ts/language-service" }] } }
```

## Checking what strict-ts took on trust: the probes

The gate proves what it can and trusts the rest: that a function the effects ledger calls safe does not throw, that
what an unsafe directory exports catches everything, that a cast with its `// SAFETY:` reason is true. `@strict-ts/probe`
checks those at run time. It rewrites the code as it is compiled, puts a probe at each of those places, and the tests
run on that code.

```ts
// vitest.config.ts
import { strictTsProbe } from '@strict-ts/probe/vite';

const probes = strictTsProbe();
export default defineConfig({ plugins: probes.ok ? [probes.value] : [] });
```

```
$ strict-ts-probe report
The ledger says these do not throw, and they threw:
  src/pricing.ts:8:61 `ReadonlyArray.join` threw TypeError: Cannot convert a Symbol value to a string
An exception left an unsafe directory:
  src/unsafe/api.ts:7:14 `parseUser` let through SyntaxError: Expected property name or '}' in JSON
A cast was not true:
  src/unsafe/api.ts:9:16 as User: .id: string expected, number found

3 contradictions; 6 library functions ran 7 times without throwing
```

A value declared read-only where it is made is also frozen, so that changing it through any name throws in the test.
It only sees what the tests run: it finds what is wrong, it does not prove that nothing is. `pnpm probe` runs it on
this repo.

## The standard library

`@strict-ts/std` is what conforming code is written with. It is a runtime library and does not depend on the checker.

```ts
import { attempt, err, type Mut, ok, Option, panic, Result, s } from '@strict-ts/std';
```

| | |
|---|---|
| `Result<T, E>` | `ok(value)`, `err(error)`; `.map`, `.mapErr`, `.andThen`, `.unwrapOr`, `.match`, `.expect` (stops the program: for a bug); `if (r.ok)` narrows |
| `Result.gen` | Rust's `?` operator: `const x = yield* r` gives the value or leaves with the error. Works with `async function*` |
| `attempt(fn, onError)` | For unsafe code: turns an exception or a rejected promise into an `Err` |
| `Option<T>` | `Option.from(value)`, `some`, `none`; `.map`, `.andThen`, `.unwrapOr`, `.okOr`, `.match` |
| `s` | Schemas: `s.object`, `s.array`, `s.record`, `s.literal`, `s.optional`, `s.string`, `s.number`, `s.boolean`, `s.date`; `s.Infer<typeof X>` gives the type, read-only |
| `s.nonEmpty`, `s.positive`, `s.integer`, `s.between`, `s.refine`, `s.branded` | Constraints carried by the type: a value that passed the check cannot be confused with one that did not |
| `parseJson(text)`, `toJson(value)` | JSON without exceptions: both return a `Result` |
| `textOf(value)`, `record(pairs)` | What `String(value)` and `Object.fromEntries` do, without their exceptions |
| `quotient(a, b)`, `remainder(a, b)`, `power(a, b)` | The three bigint operators that throw, giving an `Option` |
| `panic(message)`, `unreachable(value)` | For bugs, which are not domain errors: they stop the program |
| `Mut<T>` | Asks for mutation: Rust's `&mut`, read at the signature |
| `Once<T>`, `end(value)` | A value with one owner, in the manner of a value Rust moves; `end` is where the function that finishes it takes it back as a plain `T` |

## Packages

| Package | Role | State |
|---|---|---|
| [`@strict-ts/core`](packages/core) | The rule engine, with no dependency on Node or on a TypeScript version | 39 rules, TypeScript 6 provider |
| [`@strict-ts/cli`](packages/cli) | The CI gate | text, JSON and SARIF output, `strict-ts.json`, baseline, incremental cache |
| [`@strict-ts/std`](packages/std) | The runtime library of conforming code | `Result`, `Option`, schemas, `panic`, `Mut`, `Once` |
| [`@strict-ts/wrap`](packages/wrap) | Generates the `unsafe/` wrapper of a dependency | functions and constants; classes and objects left out |
| [`@strict-ts/derive`](packages/derive) | Generates the schema of a type from the type: nobody writes a schema | a spike: objects, arrays, literals, choices, records, dates, brands; one file at a time |
| [`@strict-ts/language-service`](packages/language-service) | The refusals in the editor | plugin tried against a real TypeScript server |
| [`@strict-ts/vscode`](packages/vscode) | The VS Code extension that carries the plugin; not published | builds a VSIX; not opened in an editor yet |
| [`@strict-ts/oxlint-plugin`](packages/oxlint-plugin) | `no-throw`, `no-null` and `no-ts-directive` as an Oxlint plugin: a quick first answer, not a faster gate | same diagnostics as the gate, compared in a test |
| [`@strict-ts/probe`](packages/probe) | Runs the tests on instrumented code and reports what contradicts what the gate took on trust | calls, unsafe boundaries, casts, frozen read-only values |
| [`@strict-ts/playground`](packages/playground) | strict-ts in the browser, on eleven scenarios; not published | builds to one page, or to one file with the compiler inside |
| [`@strict-ts/ledger`](packages/ledger) | Builds the effects ledger: runs the standard library and reads the specification; a tool of this repo | 802 of 844 functions of ECMAScript run, 797 entries; 1,464 functions of the DOM run in a browser |
| [`@strict-ts/codemod`](packages/codemod) | Automatic fixes and migration of existing code | `readonly-types` and `no-type-predicate`, each fix kept only if the project still compiles |
| `@strict-ts/flow` | Flow analysis across `await` and aliases. The single-use rule does not need it: it follows each function on the syntax tree of `core` | not started |

## Known limits

strict-ts refuses when it is not sure, but these are accepted today although the types do not cover them:

- **The two reviews list known ways, and are not proofs.** Of 26 known ways to make a value differ from its type
  with no `any`, cast, `!` or `declare`, and of 27 known ways for safe code to throw or to reject with no `throw`
  written, the rules refuse all but one: a function that calls itself without end, which is outside the guarantee
  as a stack overflow is outside Rust's. Each is a file of `packages/core/test/fixtures/attacks` or
  `fixtures/escapes` that fails when it is run, and a test records which rule refuses it. What nobody thought of
  is not in the list.
- The effects ledger proves ECMAScript only. The DOM is run in a browser and not read: a function that never threw
  there is refused unless the project writes `"assume": ["dom-as-observed"]`, which is taking 80 calls for a proof.
  Node and `Intl` are neither read nor run: their functions are refused. A method of a typed array throws once its buffer is detached: it is refused
  unless the project writes `"assume": ["attached-buffers"]`.
- A single-file component (`.vue`, `.svelte`, `.astro`) is not read. `unread-sources` refuses each one, so that a
  project does not pass with code nobody checked; accepting them in the baseline is saying so in writing. The CLI
  finds those the project's `include` and `exclude` would take if the compiler read them; the editor plugin and
  the playground do not look for them.
- A call that is run because its arguments are written is run in the gate's engine. The code may run in another,
  where a locale or a flag of a regular expression is missing.
- The reading of the specification still holds three short lists that are a judgement: the operations taken to run
  the caller's own code (a callback, a getter), the checks of the receiver's class, the sizes no machine holds.
- A value typed read-only can still reach a mutable type through a property of an object literal or the right side
  of an assignment: `mut-from-readonly` looks at arguments, initializers and returned values.
- `use-once` proves a small subset: a value given away in plain sequence or in both branches of an `if`. It trusts
  the methods of the value not to keep it, and the function that returns a `Once<T>` not to hand the same object out
  twice. A helper that only reads the value cannot borrow it: it takes it and gives it back.
- `no-throwing-operator` knows the operators and the accessors of ECMAScript. A property of the DOM that throws when
  read (`localStorage` where storage is denied) is not seen, nor a variable read before its `let` has run. Running out of stack or of memory is outside what any rule covers, as in Rust.
- `unsafe-boundary` checks exported functions, not the methods of an exported object or class.
- Inferred types are not read by `readonly-types`: `const xs = [1, 2]` is a mutable local.
- A source file of the program outside the directory of `tsconfig.json` is compiled but not checked.
- A declaration file inside an unsafe directory is accepted whole.
- Only the TypeScript 6 API is supported.

## Working on it

```sh
pnpm lint && pnpm build && pnpm test && pnpm check && pnpm corpus && pnpm probe && pnpm ledger
```

`pnpm corpus` runs the gate on a fixed set of projects (the packages, the examples, the fixtures) and compares what
each rule refuses with `corpus/expected.json`; any difference fails, so a rule cannot start refusing more or less
without a word. `pnpm corpus --external` adds open source projects cloned at a pinned commit, and `--update` records
a change that is meant.

`pnpm check` runs strict-ts on its own packages, as the CI does. All pass with nothing recorded, except `std`, whose
baseline can only shrink. Build before testing: the adapters' tests load the built packages.

Node ≥ 22.13. The work (backlog, milestones), the specs and one RFC page per rule are in Plane, project
[STS](https://plane.adserver.fr/alex/projects/2c1f2990-e14d-4f3d-9186-ebbe292b8c8f/issues/); this repo holds the code,
the pull requests and the CI. A new rule starts with its RFC: the guarantee it serves, one refused example and its
fix, the cost in lines measured on the examples, the known false positives.

## License

MIT.
