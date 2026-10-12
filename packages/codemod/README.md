# @strict-ts/codemod

Automatic fixes for what strict-ts refuses, where the fix is mechanical: the tool that empties a baseline.

```sh
strict-ts-fix -p . --dry-run     # says what it would change, writes nothing
strict-ts-fix -p .               # writes it
strict-ts-fix --rule readonly-types
```

| Rule | What the fix writes |
|---|---|
| `readonly-types` | `readonly` in front of arrays, tuples and properties; `ReadonlyArray`, `ReadonlyMap`, `ReadonlySet`; `Readonly<…>` around a `Record` |
| `no-type-predicate` | Removes a written `x is T` from a function, so that the compiler infers it |
| `no-null`, on request | `undefined` in place of `null`, as a value and as a type, where the value stays in the program; the comparisons that read it follow |

**A fix is kept only if the project still compiles and is refused for nothing more.** The fixes are applied in
memory; the project is compiled again, then checked again by the gate. When the compiler reports more errors than
before, or the gate refuses something it did not, the fixes at fault are found and dropped. So a property that the
code reassigns, or an array it pushes into, is left as it is and listed:

```
readonly-types: 24 fixes applied, 2 left
  src/mutated.ts:3:3 left as it is: with the fix the project does not compile, or is refused for more
```

What is left is a decision for a person: make the code stop changing it, or mark it `Mut<…>`.

## `no-null`: the one fix that changes what the program does

```sh
strict-ts-fix -p . --rule no-null --dry-run
```

The other fixes change types. This one changes a value, so it is not run unless it is asked for by name, and the
compiler is not enough to judge it: `JSON.stringify({ topic: undefined })` compiles as it did with `null`, and
writes something else.

**Where `undefined` would be told apart from the `null` it replaces, the `null` is left.** The types of the project
as it was are compared with its types under the fixes, at every place where a value is handed on: an argument, a
value given to a typed variable or returned, a member of an object written in place. A fix may change the type of
a value only where the type of the place that receives it changes with it. So a `null` is left when it reaches:

| Where | Why |
|---|---|
| A parameter typed `any`, `unknown` or wider than the value (`JSON.stringify`, a logger of your own, a binding of a query) | What is done with it there is not in the types |
| A function of a library that chooses its type from the argument and gives nothing of it back (`post<T>(url, body: T)`) | It sends the value away. One that gives it back is taken to keep it: `useState`, `Promise.resolve`, a `Map` |
| A text: a template, `+`, `typeof` | « null » and « undefined » |
| A type written with `as`, or filled from a value typed `any` (`JSON.parse`) | A `null` may still come in |
| A callback whose parameter says `null` for what a library gives it | The library gives `null` |
| The assertion of a test (`expect(found).toBeNull()`) | The test says which it is |
| A place where `undefined` already means something: `T \| null \| undefined`, an optional property or parameter, a parameter with a default | Two states would become one. Not even tried |

A strict comparison with `null` (`=== null`, `!== null`) of something that became `undefined` is rewritten with the
fixes it follows from. A comparison with `undefined` whose other side changes is a place that tells them apart.

Some places take both alike and are not counted: the left of `??` and `||`, `Boolean(…)`, what is shown between
two tags of JSX, the list of dependencies of a hook of React.

The fixes hold in groups, a type with the values written for it, so they are only ever taken out: what an error or
a crossing points at goes, then what no longer compiles without it, until the project holds. Nothing is tried
again alone.

**What it cannot see**, and why the tests are to be run after it:

- a function of a library that keeps the type and looks at the value anyway: the heuristic above takes it for a
  container;
- a type too large to be read whole (600 types from one place, 10 deep) is compared by its name beyond that;
- code the compiler does not read: a template of another language, a query written as text.

Measured on the applications of the pilot (dry run, nothing written):

| Application | Refused by `no-null` | Tried | Fixes kept | Time |
|---|---|---|---|---|
| facteur | 177 | 169 | 4 | 17 s |
| traefik-ui | 129 | 106 | 69 | 28 s |
| DungeonCardRPG | 226 | 173 | 17 | 51 s |
| dashboard | 250 | 205 | 65 | 2 min 33 s |
| veillee | 404 | 241 | 57 | 4 min 37 s |
| Stellar-Miner | 487 | 465 | 127 | 1 min 43 s |
| **Total** | **1,673** | **1,359** | **339** | |

A fifth of what is refused. What is not tried is a comparison, which the rule accepts, or a `null` next to an
`undefined`. What is tried and left is mostly what it should be: facteur keeps its `null` because they are rows of
a database, read with `as` and written through the bindings of a query. The rest is lost to caution: a state shown
through a property that is optional, a value given to a function that takes less than it holds. The times are
those of a machine busy with other work; each round compiles the project twice and asks the gate.

The fixes were written on a copy of two of them. traefik-ui: it compiles, its 44 tests pass, and a second run
finds nothing more. veillee: it compiles and its 572 tests pass. Two tests of traefik-ui failed with a first
version, which took `expect(…)` for a container: that is how the assertions of a test came into the table above.
The four others were not written, only measured.

## How the fixes that break the build are found

By reading the errors, not by trying the fixes one after the other: a project with two thousand fixes is settled in
a few dozen compilations.

1. Everything is applied. Each error is followed back to the declarations it reads (the property that is assigned,
   the array that is pushed into, through aliases, `Data['rows']`, a type left to inference, `[] as T[]`) and to the
   fixes written there. A fix that an error points at alone is dropped; what the errors point at is taken out until
   the project compiles.
2. The other fixes that were taken out are not known to be at fault: several were named by one error, or one only
   failed because another was out. They are put back by halves until each is either named alone, and dropped, or
   named by nothing, and kept.
3. An error that points at no fix is asked to spell it: each fix has a number, and one compilation for each binary
   digit applies the fixes that have it.

The gate is asked as the compiler is, and its refusals are read the same way. A fix can compile and weaken typing:
`Array.isArray(value)` on a `readonly T[]` gives `any[]`, so making that array read-only lets an `any` in. The gate
refuses it, and the fix is left.

What the errors say is a hint and never a verdict: the fixes that are kept have been compiled and checked together
before anything is written, and where the hints fail, the search falls back on halving the set.

Measured on the applications of the pilot (dry run, the gate's own machine):

| Application | Lines | Fixes found | Before | Now |
|---|---|---|---|---|
| facteur | 4,390 | 372 | 2 min 12 s | 3 s |
| traefik-ui | 4,806 | 329 | 1 min 57 s | 5 s |
| DungeonCardRPG | 17,411 | 871 | 9 min 39 s | 6 s |

These times are those of the search with the compiler alone. Asking the gate too adds one run of it for each
compilation that holds: 6 s, 6 s and 9 s on the same three, and 20 s, 35 s and 56 s on the three larger
applications of the pilot (1,444, 1,616 and 2,369 fixes), measured while the machine was busy with other work.

## To know

- The unsafe directories are not touched: the rules it fixes do not run there.
- What sits under `Mut<…>` is left alone.
- « Compiles » means no more compiler errors than before, counted over the project. Tests that live outside
  `tsconfig.json` are not compiled: run them after a fix.
- « Refused for nothing more » means no line that the gate refuses for a rule more often than before, with the
  rules and the configuration of the project's `strict-ts.json`.
- A fix written inside a type that another fix removes (an object type in a predicate that goes) is counted as
  applied: what it was to fix is no longer there.
- It has no fix for `no-throw` or for casts: those change what the code does, and nothing here can judge the
  change. `no-null` does too, and is judged as its section says, for what the types show.
