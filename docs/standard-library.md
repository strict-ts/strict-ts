# The standard library

`@strict-ts/std` is what conforming code is written with. It is a runtime library and does not depend on the checker.

```ts
import { attempt, err, type Mut, ok, Option, panic, Result, s } from '@strict-ts/std';
```

| | |
|---|---|
| `Result<T, E>` | `ok(value)`, `err(error)`; `.map`, `.mapErr`, `.andThen`, `.unwrapOr`, `.match`, `.expect` (stops the program: for a bug); `if (r.ok)` narrows |
| `Result.gen` | Rust's `?` operator: `const x = yield* r` gives the value or leaves with the error. Works with `async function*` |
| `attempt(fn, onError)` | For unsafe code: turns an exception or a rejected promise into an `Err` |
| `Option<T>` | `Option.from(value)`, `some`, `none`; `.map`, `.andThen`, `.unwrapOr`, `.okOr`, `.match` |
| `s` | Schemas: `s.object`, `s.loose`, `s.array`, `s.record`, `s.literal`, `s.optional`, `s.string`, `s.number`, `s.boolean`, `s.date`; `s.Infer<typeof X>` gives the type, read-only |
| `s.nonEmpty`, `s.positive`, `s.integer`, `s.between`, `s.refine`, `s.branded` | Constraints carried by the type: a value that passed the check cannot be confused with one that did not |
| `oneOf(values, given)` | The one of `values` that `given` is, or `undefined`: a field of a form or a part of a query string read as a known name, without a cast |
| `parseJson(text)`, `toJson(value)` | JSON without exceptions: both return a `Result` |
| `bodyJson(source)` | The JSON a `Request` or a `Response` carries, as a `Result`: their own `json()` gives `any` and rejects |
| `uriComponent(text)`, `fromUriComponent(text)` | `encodeURIComponent` and `decodeURIComponent` as a `Result`: both throw on text that is not well formed |
| `resultEquality` | For a test runner: `expect.addEqualityTesters([resultEquality])`. Without it `toEqual` throws on an `Err`: a `Result` is iterable, and the runner walks into it |
| `textOf(value)`, `record(pairs)` | What `String(value)` and `Object.fromEntries` do, without their exceptions |
| `quotient(a, b)`, `remainder(a, b)`, `power(a, b)` | The three bigint operators that throw, giving an `Option` |
| `panic(message)`, `unreachable(value)` | For bugs, which are not domain errors: they stop the program |
| `Mut<T>` | Asks for mutation: Rust's `&mut`, read at the signature. On a method, `this: Mut<Counter>` as its first parameter is Rust's `&mut self`; in a return type, the function hands out something its caller may change. On a field, what it holds may be written; around a list (`Mut<Line[]>`) the list may, and inside it (`Mut<Mut<Line>[]>`) what it holds |
| `Once<T>`, `end(value)` | A value with one owner, in the manner of a value Rust moves; `end` is where the function that finishes it takes it back as a plain `T` |
