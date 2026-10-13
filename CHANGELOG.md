# Changelog

Semantic versioning from 1.0: a rule that starts refusing code it accepted waits for a major version.

## Unreleased

Not a release yet. The rules of explicit mutability refuse much more than in 1.0.0, so by the line above this is
a major version when it ships.

**Explicit mutability is still a prototype**, and harder to get around: 78 known ways to change what a function
did not make and that does not say `Mut`, 77 refused, the last being aliasing, outside the guarantee. Thirteen rounds
of attacks found them; no round has yet found nothing.

- Giving a value where `Mut<…>` is asked is judged as a write of it: a parameter, `this` or a part of it, what a
  call gave, a field or a list that does not say so, under any name or none.
- What a list a function gave back holds is written only if the return type says `Mut<…>` inside. A map says it of
  its values, a tuple of each element.
- A method says no more of `Mut` than the member it stands for in a class it extends or an interface it
  implements, and an object is not given under a type whose members say less.
- What a function of the library gives back may be what it was given, apart from a short list known to make
  something new. What another module exports is that module's to change, unless it says `Mut<…>`.
- `readonly Mut<Line>[]` on a parameter lets the elements be written and not the list.
- An application written with classes was made to pass (11,000 lines, Three.js): the cost is in
  [Adopting it](docs/adopting.md).

**Safe typing**: 32 known ways, all refused. `no-stale-narrowing` accepts a value that is tested again after a
call (a comparison, a value read for its truth, a `switch` that has a `default`), and no longer runs in test files.

**The library**: `setAt(list, index, value)`, a checked write at a position an array has.

**The fixer** writes `this: Mut<…>` where a part of the object is handed out, and `Mut<…>` in return types, down
into the list a function gives back.

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
out. 35 known ways, 34 refused. Its rules were widened a great deal just before this release and have been tried
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
