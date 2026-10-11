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
again; when the compiler reports more errors than before, the set is halved until the fixes that break the build are
found, and those are dropped. So a property that the code reassigns, or an array it pushes into, is left as it is and
listed:

```
readonly-types: 24 fixes applied, 2 left
  src/mutated.ts:3:3 left as it is: the project does not compile with the fix
```

What is left is a decision for a person: make the code stop changing it, or mark it `Mut<…>`.

## To know

- The unsafe directories are not touched: the rules it fixes do not run there.
- What sits under `Mut<…>` is left alone.
- « Compiles » means no more compiler errors than before, counted over the project. Tests that live outside
  `tsconfig.json` are not compiled: run them after a fix.
- It does not add `Mut<…>`, and it has no fix for `no-throw`, `no-null` or casts: those change what the code does.
