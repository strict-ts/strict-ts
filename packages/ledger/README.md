# @strict-ts/ledger

Builds the generated part of the effects ledger, the list the rule `no-throwing-call` reads to know whether a function
of the standard library may throw. Private: it is a tool of this repo.

```sh
pnpm --filter @strict-ts/ledger build     # runs every function and writes packages/core/src/effects/generated.ts
pnpm ledger                               # the same in memory; fails when the verdicts differ from what is written
```

## How an entry is made

Two readings of each function, and an entry from the two.

**What the runs show.** `scripts/library.mjs` reads the compiler's own declarations of the standard library: 844
functions, methods and constructors, with the types of their parameters. `scripts/values.mjs` generates values that
fit those types, from a seeded sequence, in two ways: **plain** (strings, numbers, booleans, null, undefined, arrays
of those) and **anything** (also symbols, objects without a prototype, cycles) wherever a type says nothing.
`scripts/fuzz.mjs` calls 353 of the functions 300 times in each way, in a thread that is stopped and restarted past a
function that never returns.

**What the specification says.** `scripts/spec.mjs` reads the ECMAScript specification as its authors write it. Every
step that may fail says so there: `throw a *RangeError* exception`, or a call marked `?`, which hands the callee's
failure on. Following those marks from a function gives every way it can throw. Some of those ways a typed call
cannot reach (a wrong receiver, a callback that is not callable, a size no machine holds), and some depend on the
types of the parameters (a conversion that fails on a symbol). The lists that say which are the judgement of the
reader. `scripts/spec-facts.mjs` fetches the specification (ECMAScript 2023) and writes what it found to
`spec/facts.json`, kept in the repo so that a build needs no network.

`scripts/derive.mjs` then decides:

| The specification | The runs | The entry |
|---|---|---|
| No way to throw | Never threw | `total`: both agree |
| Only conversions | Never threw, even on what cannot be converted | `total`: the types exclude what the conversions refuse |
| A real way to throw | Never threw | `throws`: the prudent one of the two |
| Anything | Threw on plain values | `throws`, with the call it was seen on, and `below` or `atLeast` when it only threw for some numbers of arguments |
| Anything | Threw only on what is not plain | `throws` with `unprintable`: safe when the receiver and the arguments are plain by their types |
| No way to throw | Threw | **A contradiction**: the reading of the specification is wrong there. The entry says `throws`, and the build fails unless the case is in `acknowledged.json` with its reason |

A function that was not run gets an entry only when the specification gives it a real way to throw.

## Operators and accessors

A call is not the only thing that throws. `scripts/operators.mjs` runs every operator of the language, and the
template, on every pair of 14 kinds of operand; each combination that threw is then written as code and given to the
compiler, and those it accepts are kept: 97 of 943 (`1n / 0n`, `` `${value}` `` on an object without a prototype).
The reader of the specification also reads its 32 accessors: two can throw on the object they are read from, both on
`DataView`. The rule `no-throwing-operator` reads both tables.

## Where it stands

385 generated entries: 269 `total`, each with its clause of the specification and 600 runs that never threw; 116
`throws`. Seven contradictions, all understood and written in `acknowledged.json` (a rejected promise, which is not
a throw in the specification; a call the reader does not follow).

## What it does not do

- It runs 353 of the 844 functions. Typed arrays, `Atomics`, `Intl`, generators and iterators are not run; they get
  an entry only when the specification gives them a real way to throw, and are refused otherwise.
- **The reading of the specification is a judgement.** The lists of what a typed call cannot reach were written by
  hand and tuned until they agreed with the runs. A function both readings get wrong the same way would be called
  safe.
- The DOM and Node have no specification this reads: their entries stay by hand, or absent.
- A result too long for the engine (`Invalid string length`) is a limit of the machine, like running out of memory,
  and is not counted as an exception.
- A generated value may not fit a type the generator reads too loosely; the function then gets `throws` when it does
  not deserve it. That errs on the side of refusing.
