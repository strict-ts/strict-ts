# @strict-ts/std

The runtime library of conforming code: what replaces `throw`, `null` and casts. It has no dependency and never
imports the checker.

```ts
import { attempt, err, type Mut, ok, Option, panic, Result, s } from '@strict-ts/std';
```

## Result

```ts
const half = (n: number): Result<number, 'odd'> => (n % 2 === 0 ? ok(n / 2) : err('odd'));

half(4).map((n) => n + 1);                                  // Ok(3)
half(3).unwrapOr(0);                                        // 0
half(3).match({ ok: (n) => `${n}`, err: (e) => `no: ${e}` });

const r = half(4);
if (r.ok) r.value; else r.error;                            // narrowed by `ok`
```

`Result.gen` is Rust's `?` operator. `yield*` gives the value of a `Result` or leaves at once with its error; the
error type is the union of every error met. It works with `async function*` too.

```ts
const quarter = (n: number) =>
  Result.gen(function* () {
    const h = yield* half(n);
    return half(h);
  });
```

`attempt` is for unsafe code: it turns an exception, or a rejected promise, into an `Err`.

```ts
export const parseJson = (text: string) => attempt((): unknown => JSON.parse(text), String);
```

For JSON, `parseJson(text)` and `toJson(value)` return `Result`s: `JSON.parse` throws on text that is not JSON, and
`JSON.stringify` on a cycle or a BigInt.

## Option

```ts
const first = (items: readonly string[]) => Option.from(items[0]);

first([]).unwrapOr('none');
first(['a']).map((s) => s.length).okOr('empty');            // a Result
```

## Schemas

The type is declared once and derived, read-only, from the schema.

```ts
const User = s.object({ id: s.string, role: s.literal('admin', 'user'), birth: s.optional(s.date) });
type User = s.Infer<typeof User>;

User.parse(input); // Result<User, { path: string; expected: string }>
```

`s.string`, `s.number` (finite), `s.boolean`, `s.date` (an ISO string), `s.literal(...)`, `s.array(item)`,
`s.optional(inner)`, `s.object(shape)`, `s.record(value)` (an object used as a table: any names, values of one kind).
Unknown keys of an object are dropped.

## Constraints carried by the type

A value that passed a check has a type that says so, and a plain value is not accepted in its place.

```ts
const Quantity = s.positive(s.integer());
type Quantity = s.Infer<typeof Quantity>;        // a number, branded Positive and Integer
const CustomerId = s.branded(s.string, 'CustomerId');

const price = (quantity: Quantity): number => quantity * 2;
price(2);                                        // refused by the compiler: 2 did not pass the check
Quantity.parse(input).map(price);                // the only way in
```

`s.nonEmpty(inner)`, `s.positive(inner?)`, `s.integer(inner?)`, `s.between(min, max)`, `s.refine(inner, 'Name', test)`
for a check of your own, `s.branded(inner, 'Name')` for a name without a check. The brand exists in the type only;
outside an unsafe directory, forging one needs a cast, which `no-cast` refuses.

## panic, unreachable, Mut

`panic(message)` and `unreachable(value)` are for bugs, which are not domain errors: they stop the program instead of
adding a case to every error type.

`Mut<T>` asks for mutation, in the manner of Rust's `&mut`. It is `T` itself: a marker the rules read.

## expect

`result.expect(what)` and `option.expect(what)` give the value, or stop the program saying what was expected, as in
Rust. For a failure that is a bug and not a case the caller handles: a row of your own database that is not what you
wrote there.

```ts
const rows = sql.all('select * from messages').expect('the rows of messages');
```

## Once, end

`Once<T>` marks a value with one owner, given away exactly once: a transaction, a lock, a handle. It is `T` with a
mark the rule `use-once` reads, so a function makes one by saying so in its return type, without a cast.

```ts
export function begin(): Once<Transaction> { return new Transaction(); }
export function commit(tx: Once<Transaction>): Result<void, DbError> {
  const raw = end(tx); // the one place a Once becomes a plain value again
  return raw.flush();
}
```

## Without their exceptions

| | In place of | Which throws on |
|---|---|---|
| `textOf(value)` | `String(value)`, `` `${value}` `` | A symbol in an array, an object without a prototype |
| `record(pairs)` | `Object.fromEntries(pairs)` | A key that cannot be converted |
| `parseJson(text)`, `toJson(value)` | `JSON.parse`, `JSON.stringify` | Text that is not JSON; a cycle, a bigint |
| `quotient(a, b)`, `remainder(a, b)`, `power(a, b)` | `a / b`, `a % b`, `a ** b` on bigints | A zero divisor, a negative exponent |

The first two return a value, the others a `Result` or an `Option`.

## To know

- A `Result` is iterable (that is what `yield*` uses). Spreading an `Err` throws, and a generic deep-equality compares
  two `Ok` as equal: compare `.value` and `.error`.
- The free functions `map`, `andThen`, `mapErr`… are the first version's; the methods replace them.
