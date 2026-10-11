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
`scripts/fuzz.mjs` calls 802 of the functions 300 times in each way, in a thread that is stopped and restarted past a
function that never returns.

**What the specification says.** `scripts/spec.mjs` reads the ECMAScript specification as its authors write it. Every
step that may fail says so there: `throw a *RangeError* exception`, or a call marked `?`, which hands the callee's
failure on. Following those marks from a function gives every way it can throw.

Not every such way concerns typed code, and the reader does not assume which. It follows where each value of an
algorithm comes from (the receiver, a parameter, what a callback returned, a primitive the algorithm made), through
the operations a function hands its arguments to, and then asks the declared types:

- a check that a parameter is callable, or is an object, holds when every declared signature gives the parameter
  that kind, and is a real way to throw otherwise;
- a conversion (`? ToString(_x_)`) can fail only on a kind of value the conversion refuses and the declared type
  lets in. What each conversion refuses is a table of ten lines, which a test checks by running each conversion.

A few functions have no algorithm: the specification describes them in words (`Math.random`, `Date.now`,
`toUpperCase`). The words are read where they say enough: that the function is another one (« behaves in exactly the
same way as »), that it takes nothing and names no error, or which conversion it applies to its argument.

What is left to judgement is three short lists: the operations that run the caller's own code (a callback, a
getter), the checks of the receiver's class, and the sizes no machine holds. `scripts/spec-facts.mjs` fetches the
specification (ECMAScript 2023) and writes what it found to `spec/facts.json`, kept in the repo so that a build
needs no network.

`scripts/derive.mjs` then decides:

| The specification | The runs | The entry |
|---|---|---|
| No way to throw | Never threw | `total`: both agree |
| A conversion that refuses a primitive the declared types let in | Never threw | `total`: the runs try every primitive kind a type admits |
| A conversion that refuses some objects the declared types let in | Never threw | `throws` with `unprintable`: no run can try every object |
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

797 generated entries for the 844 functions:

| Entries | Verdict | On what |
|---|---|---|
| 310 | `total` | The clause of the specification and 600 runs that never threw |
| 196 | `throws` | A call that was seen to throw, or a conversion that may meet an object it refuses; 25 of them only on what is not plain |
| 284 | `throws` with `detached` | The specification: only on a buffer that was detached. The runs never threw |
| 7 | `throws` | The specification only: no run found it |

Twenty-two contradictions, all understood and written in `acknowledged.json`: a rejected promise, which is not a throw
in the specification; a call the reader does not follow; `Int8Array.from(["a"])`, which the declarations accept.

### A detached buffer

Every method of a typed array or of a `DataView` throws once its buffer was handed to another thread or transferred.
No run does that, and no rule can tell that a project never does. So these entries carry the condition `detached`,
and a project answers it in writing, in `strict-ts.json`:

```json
{ "assume": ["attached-buffers"] }
```

Without that line, the calls are refused.

## What it does not do

- It runs 802 of the 844 functions. The rest is `Intl`, which another specification defines, and the interfaces a
  caller implements (a proxy handler, an iterator): they are refused.
- **Three lists are still a judgement**: the operations taken to run the caller's own code, the checks of the
  receiver's class, the sizes no machine holds. A write to a frozen object is taken for a plain write.
- The DOM and Node have no specification this reads: their entries stay by hand, or absent.
- A result too long for the engine (`Invalid string length`) is a limit of the machine, like running out of memory,
  and is not counted as an exception.
- A generated value may not fit a type the generator reads too loosely; the function then gets `throws` when it does
  not deserve it. That errs on the side of refusing.
