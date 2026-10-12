# Adopting it on existing code

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

## A Next application

One was made to pass with no baseline (4,831 lines; a third of them changed). What a Next project needs that
nothing above says:

```json
{
  "unsafeDirs": ["src/unsafe", "next-env.d.ts", ".next"],
  "testDirs": ["test", "tests", "vitest.config.ts"],
  "allowedImports": ["@strict-ts/std", "next", "react", "react-dom"],
  "assume": ["dom-as-observed"]
}
```

- **`next-env.d.ts`** is generated at the root and rewritten by Next: it is named as a single unsafe file. So is the
  configuration of the test runner, as a test.
- **`.next/types` is not yours, and is checked if the gate sees it.** Next puts it in the `include` of
  `tsconfig.json` and writes it back when it is removed. Naming `.next` unsafe is not enough: generated code has
  `@ts-ignore` and casts with no reason given, which are refused there too. Give the gate its own project file,
  and run `strict-ts -p tsconfig.strict.json`:

  ```json
  { "extends": "./tsconfig.json", "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"], "exclude": ["node_modules", ".next"] }
  ```

- **A stylesheet imported for its effect** (`import "./globals.css"`) needs a declaration: `declare module "*.css";`
  in a `.d.ts` of the unsafe directory.
- **A route reads its body with `bodyJson(request)`** and a schema; `request.json()` gives `any`.
- **`null` becomes `undefined`** in states, props and what a component returns: React takes both.

## Explicit mutability, in practice

What the rules of mutability ask for, as it came up on an 11,000-line game written with classes (2 % more lines,
about 390 that carry `Mut<…>`, most of them written by the fixer):

- **What you make and hand out says `Mut<…>` in the return type.** `const fresh = (): Cart => ({ total: 1 })`
  hands out something to read. Kept in a field typed `Mut<Cart>`, it is refused: write `(): Mut<Cart>`.
- **A list says `Mut` twice.** `Mut<Cart[]>` is a list you may push into; `readonly Mut<Cart>[]` is a list of carts
  you may change; `Mut<Mut<Cart>[]>` is both. For a map, it is the values that say it.
- **A copy is one level.** `[...carts]` is yours to sort. The carts in it are still whose they were.
- **A method that hands out a part of its object to be changed says `this: Mut<…>`**, and so does everything that
  calls it. If the same method is called by code that only reads, that code now asks for `Mut` too, and its
  signature says nothing any more. On the game, `entities.living()` did that to every renderer. The way out is
  Rust's: two methods, one that gives a read-only view and one that says `this: Mut<…>`. The fixer does not write
  that for you; it says `Mut` all the way up.
- **A helper over a family of types takes a generic.** `addClass(element: Mut<Element>, …)` refuses a
  `HTMLDivElement`, because a write through the wider type could break the narrower one. Write
  `addClass<E extends Element>(element: Mut<E>, …)`.
- **A helper that stops the program is not unsafe code.** What leaves `src/unsafe/` returns a `Result`. A call of
  the page that can only fail on a bug of yours goes in checked code, in a `try` whose `catch` calls `panic`.
- **What a module exports is its own to change.** To let an importer change it, declare it `Mut<…>`.
- **A function type you write says something by saying nothing.** `(cart: Cart) => void` is a function that does
  not change the cart: one that asks for `Mut<Cart>` is not given there.

Refused though it is right, and how to write it instead: `list.reduce(…)` into an accumulator that is then written
(the library might have handed back an element; use a loop), and a count kept in an object next to a value you were
given (keep the count apart).

## The baseline

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

Where `readonly` does not hold because the value is written, the fixer writes `Mut<…>` around the type in its
place: the write is real, and now the type says so. And one fix is run when its rule is named:

```sh
node packages/codemod/dist/main.js -p . --rule no-non-null
```

It turns `value!` into `(value ?? panic("value is missing"))`. What `!` claimed is then checked: where the value is
missing after all, the program stops there and says so, in place of going on with `undefined`. It is not the end of
the work, it is a place to look at: many of them are an array read by position, where a `for … of` needs no check.

Both write a name of `@strict-ts/std`, which has to be installed.

One more fix is not run unless it is asked for, because it is not judged one place at a time:

```sh
node packages/codemod/dist/main.js -p . --rule no-param-mutation
```

It writes `Mut<…>` where the gate says something is changed without a word: `this: Mut<Name>` on a method that writes
its object, `Mut<…>` around the type of a parameter that is written and around the return type of a function whose
result is written. The word removes a refusal where it is written and makes one at each caller that holds the value
without saying it may change it; so the gate is asked again, and again, up the calls. The whole is kept if the
project compiles and is refused in fewer places than before, or none of it is. On an 11,000-line game written with
classes it wrote 154 of them in 18 seconds, and `no-param-mutation` went from 491 refusals to 30. It needs
`@strict-ts/std` installed: it imports `Mut` from it.

A last one is run only when it is asked for too, because it changes what the program does and not only its types:

```sh
node packages/codemod/dist/main.js -p . --rule no-null --dry-run
```

It writes `undefined` in place of `null` where the value stays in the program: a state, a parameter, what a
function gives back. A `null` that is written as JSON, shown in a text, given to a library or checked by a test is
left, and so is one that stands next to an `undefined` that means something else. Run the tests after it: see
[the package](../packages/codemod) for what it cannot see.

About the baseline itself:

- A file and rule that hold more violations than recorded are refused whole, each with « n allowed by the baseline ».
- A fixed violation leaves a stale entry: a warning, or a failure with `--strict-baseline`, so the record only shrinks.
- The compiler's own errors are never recorded.
- The summary line reads `0 new, 8 baselined, 0 stale, 0 files out of the baseline`.
