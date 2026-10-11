# Examples

Four small programs, each written twice: **classic**, as `tsc --strict` accepts it, and **strict**, conforming. The
classic one shows what goes wrong and what strict-ts says of it; the strict one, what the fix costs.

All of them are compiled, checked by the gate in the CI and run by the tests (`packages/cli/test/examples.test.ts`):
what a comment says a function does, a test saw it do.

```sh
node packages/cli/dist/main.js -p examples/report/classic    # what is refused
node packages/cli/dist/main.js -p examples/report/strict     # nothing
```

| Example | About | Classic is refused for | The strict one uses |
|---|---|---|---|
| [`invoice`](invoice) | Typing and errors: a cast on `JSON.parse`, `null`, `throw`, `!`, a `switch` that forgets a case | 22 refusals, 10 rules | Schemas, `Result`, `Option`, a `satisfies` object |
| [`report`](report) | What throws without saying so | 15 refusals: `JSON.parse`, `new RegExp`, `BigInt`, `toFixed`, a bigint `/`, a template | `attempt` in `unsafe/`, `quotient`, `Result.gen` |
| [`cart`](cart) | Explicit mutability | 11 refusals: `push` and `sort` on a parameter, properties that can be reassigned | Read-only types, copies, `Mut<…>`, a directory declared pure |
| [`transfer`](transfer) | Ownership | 7 refusals, none about the transaction: nothing says it has an owner | `Once<Transaction>`, `end` |

## report: five ways to throw that no type announces

```ts
export function average(sales: Sale[]): bigint {
  const total = sales.reduce((sum, sale) => sum + sale.cents, 0n);
  return total / BigInt(sales.length);          // RangeError when there is no sale
}
```

```
report.ts:22:10 no-throwing-operator `/` throws a RangeError, as seen with 0n / 0n.
report.ts:22:18 no-throwing-call `BigInt` throws a SyntaxError, as seen with ("%").
```

```ts
export const average = (sales: readonly Sale[]) =>
  Result.gen(function* () {
    const total = yield* whole(sales.reduce((sum, sale) => sum + sale.cents, 0));
    const count = yield* whole(sales.length);
    return quotient(total, count).okOr("no sale matches");
  });
```

Run on the same sales, the classic report throws a `SyntaxError` on the pattern `(`, another on text that is not
JSON, and a `RangeError` when nothing matches. The strict one returns `Err("Invalid regular expression…")`,
`Err("Unexpected token…")` and `Err("no sale matches")`.

## cart: who changes what

```ts
export function cheapestFirst(items: Item[]): Item[] {
  return items.sort((a, b) => a.cents - b.cents);   // sorts the caller's array
}
```

```
cart.ts:24:10 no-param-mutation Parameter `items` is mutated by `sort`.
```

```ts
export const cheapestFirst = (items: readonly Item[]): readonly Item[] => [...items].sort((a, b) => a.cents - b.cents);

/** Where changing in place is wanted, the signature asks for it: Rust's `&mut`. */
export function restock(counts: Mut<Map<string, number>>, item: Item): void { … }
```

The strict cart lives in a directory declared pure (`"pureDirs": ["domain"]`): the day of the week is an argument of
`total`, since reading the clock there is refused.

What the rules do not see in the classic cart, and its comments say: the `let` every importer shares, the clock read
by `total`, and `item.cents = …` on an item reached through a loop. The first two are refused in a pure directory.

## transfer: a transaction with one owner

The classic transfer leaves its transaction open on one path, pushes it into an array anyone can read, and rolls it
back after committing it: it throws « already ended » at run time. None of that is refused, because nothing in its
types says a transaction is anything special. That is the point of the example: ownership has to be asked for.

```ts
export const begin = (): Once<Transaction> => new Transaction();
export const commit = (tx: Once<Transaction>): readonly string[] => end(tx).written();

const tx = begin();
tx.debit(from, cents);
if (cents <= 0) {
  rollback(tx);                 // without this line: « `tx` is not given away before this `return` »
  return err("nothing-to-move");
}
tx.credit(to, cents);
return ok(commit(tx));          // after this, any use of `tx` is refused
```

The strict `Transaction` no longer needs its `open` flag, nor the two `throw` that guarded it: what they checked at
run time, the rule checks before.

## In the playground

Each example is a scenario of the playground, classic and conforming, where it can be edited:
`packages/playground/dist/playground.html` after `pnpm build`.
