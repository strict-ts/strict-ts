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

**A fix is kept only if the project still compiles.** The fixes are applied in memory and the project is compiled
again; when the compiler reports more errors than before, the fixes that break the build are found and dropped. So a
property that the code reassigns, or an array it pushes into, is left as it is and listed:

```
readonly-types: 24 fixes applied, 2 left
  src/mutated.ts:3:3 left as it is: the project does not compile with the fix
```

What is left is a decision for a person: make the code stop changing it, or mark it `Mut<…>`.

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

What the errors say is a hint and never a verdict: the fixes that are kept have been compiled together before
anything is written, and where the hints fail, the search falls back on halving the set.

Measured on the applications of the pilot (dry run, the gate's own machine):

| Application | Lines | Fixes found | Before | Now |
|---|---|---|---|---|
| facteur | 4,390 | 372 | 2 min 12 s | 3 s |
| traefik-ui | 4,806 | 329 | 1 min 57 s | 5 s |
| DungeonCardRPG | 17,411 | 871 | 9 min 39 s | 6 s |

## To know

- The unsafe directories are not touched: the rules it fixes do not run there.
- What sits under `Mut<…>` is left alone.
- « Compiles » means no more compiler errors than before, counted over the project. Tests that live outside
  `tsconfig.json` are not compiled: run them after a fix.
- A fix written inside a type that another fix removes (an object type in a predicate that goes) is counted as
  applied: what it was to fix is no longer there.
- It does not add `Mut<…>`, and it has no fix for `no-throw`, `no-null` or casts: those change what the code does.
