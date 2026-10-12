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

About the baseline itself:

- A file and rule that hold more violations than recorded are refused whole, each with « n allowed by the baseline ».
- A fixed violation leaves a stale entry: a warning, or a failure with `--strict-baseline`, so the record only shrinks.
- The compiler's own errors are never recorded.
- The summary line reads `0 new, 8 baselined, 0 stale, 0 files out of the baseline`.
