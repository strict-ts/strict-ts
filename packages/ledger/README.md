# @strict-ts/ledger

Builds the generated part of the effects ledger, the list the rule `no-throwing-call` reads to know whether a function
of the standard library may throw. Private: it is a tool of this repo.

```sh
pnpm --filter @strict-ts/ledger build     # runs every function and writes packages/core/src/effects/generated.ts
pnpm ledger                               # the same in memory; fails when the verdicts differ from what is written
```

## How an entry is made

1. `scripts/library.mjs` reads the compiler's own declarations of the standard library: 844 functions, methods and
   constructors, with the types of their parameters.
2. `scripts/values.mjs` generates values that fit those types, from a seeded sequence, in two ways: **plain** (strings,
   numbers, booleans, null, undefined, arrays of those) and **anything** (also symbols, objects without a prototype,
   cycles) wherever a type says nothing (`any`, `unknown`, a type parameter).
3. `scripts/fuzz.mjs` calls each function 300 times in each way, in a thread that is stopped and restarted past a
   function that never returns.
4. `scripts/derive.mjs` turns what was seen into entries:

| Seen | Entry |
|---|---|
| Threw on plain values | `throws`, with the call it was seen on; and `below` or `atLeast` when it only threw for some numbers of arguments |
| Threw only on what is not plain | `throws` with `unprintable`: safe when the receiver and the arguments are plain by their types |
| Never threw | No verdict: the count of runs is kept as evidence for the entry a person or the specification gives |

## What it does not do

- It runs 353 of the 844 functions. Typed arrays, `Atomics`, `Intl`, generators and iterators are not run.
- A function that never threw is not proven not to throw.
- A result too long for the engine (`Invalid string length`) is a limit of the machine, like running out of memory,
  and is not counted as an exception.
- A generated value may not fit a type the generator reads too loosely; the function then gets `throws` when it does
  not deserve it. That errs on the side of refusing.
