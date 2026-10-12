# Changelog

Semantic versioning from 1.0: a rule that starts refusing code it accepted waits for a major version.

## 1.0.0

The first release. `@strict-ts/core`, `@strict-ts/cli`, `@strict-ts/std` and `@strict-ts/codemod`.

**Two guarantees are « Acquired »**, in the narrow sense the README gives: no way around them is known in checked
code.

- **Safe typing.** No `any`, cast, `!`, `declare` or `@ts-ignore` outside an unsafe directory, and the corners where
  TypeScript itself lets a value differ from its type are closed: 31 known ways, each a file of
  `packages/core/test/fixtures/attacks` with the rule that refuses it.
- **Errors in the types.** No `throw`, no rejected promise, no `null`; a call or an operator that may throw is caught
  where it is written, from a ledger of what throws that was derived by running the standard library and reading the
  specification, and by running the DOM in a browser. 29 known ways, 28 refused; the last, a function that calls
  itself without end, is outside the guarantee as a stack overflow is outside Rust's.

**Explicit mutability is a prototype.** Types are read-only unless they say `Mut<T>`; a function changes only what
it made, or what says `Mut`: a parameter, `this` in a method that says `this: Mut<…>`, what another function hands
out. 24 known ways, 23 refused. Its rules were widened a great deal just before this release and have been tried
on one application: expect them to move, in 2.0.

**Ownership is research**: `use-once`, on a small subset.

What comes with it:

- `strict-ts`, the gate, in place of `tsc --noEmit`: text, JSON and SARIF, a baseline that can only shrink, a cache.
- `strict-ts-fix`, the fixer: read-only types, `Mut<…>` where a value is written, a checked assertion for `x!`,
  `undefined` for a `null` that stays in the program, `this: Mut<…>` up the calls. Each fix is kept only if the
  project compiles and is refused for nothing more.
- `@strict-ts/std`: `Result`, `Option`, `attempt`, `panic`, schemas (`s.object`, `s.loose`, `s.union`…), `Mut`,
  `Once`, JSON and the web platform without exceptions.
- An editor plugin, a playground, an Oxlint plugin for three of the rules: in the repository, not published.

Known limits: `docs/known-limits.md`. Only the TypeScript 6 API is supported.
