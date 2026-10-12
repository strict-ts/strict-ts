# The rules

## The rules

« Scope » says where a rule runs: `safe` is everything outside the unsafe directories, `unsafe` is inside them, `all`
is both, `project` is once for the whole project.

| Rule | Guarantee | Scope | What it asks |
|---|---|---|---|
| `no-any` | typing | safe | No `any`, written or inferred (`JSON.parse` for instance) |
| `no-cast` | typing | safe | No type assertion (`as T`, `<T>x`). `as const` and `satisfies` stay allowed |
| `no-non-null` | typing | safe | No non-null assertion `x!`, no definite assignment `x!: T` |
| `no-type-predicate` | typing | safe | No written type predicate (`x is T`, `asserts x is T`). The ones the compiler infers stay |
| `no-overload` | typing | safe | No overload signature: nothing checks that the implementation keeps each promise, and one can be a cast |
| `no-method-signature` | typing | safe | No method syntax in an interface or a type (`name(x: T): R`): written `name: (x: T) => R`, it is compared soundly |
| `no-numeric-enum` | typing | safe | No enum with a member that is a number: any number is accepted where one is asked for. An enum of texts stays |
| `no-unset-capture` | typing | safe | A variable declared with no value (`let ready: string;`) is not used by a function: nothing shows it has a value when the function runs |
| `no-early-read` | errors | safe | A value is not read before its line: no function is used at the top of a file above a variable it reads, and files do not import each other in a circle |
| `no-reject` | errors | safe | A promise is not made to fail: the callback of `new Promise` does not take the function that rejects it, and no object has a `then` of its own |
| `no-stale-narrowing` | typing | safe | What a test narrowed is not relied on after a call or an `await` that could change it (a `let` another function writes, a property that can be written), nor on a getter |
| `no-class-lookalike` | typing | safe | Where a class is asked for, the value is made by that class, not an object of its shape |
| `no-loose-spread` | typing | safe | A spread does not write a property its type does not name: over one written before it, or into one the result may have |
| `no-in-narrowing` | typing | safe | `in` does not choose between the members of a union: a tag does |
| `no-open-read` | typing | safe | `Object.values` and `Object.entries` read a table (`Record`) only, and a table is not made from a value with named properties: it may hold more than its type names |
| `no-keyed-write` | typing | safe | A property is written through a key only when the key is one name |
| `no-resize` | typing | safe | An array gets no hole and a tuple keeps its length: no assignment to `length`, no write by position (`splice(i, 1, v)`), no `push` or `pop` on a tuple |
| `mut-exact` | typing | safe | What is given where `Mut<…>` is asked for has exactly that type: a `Mut<string[]>` is not a `Mut<(string \| number)[]>` |
| `no-unbound-method` | typing | safe | A method is called through its object: taken off it as a value it loses `this` |
| `no-early-this` | typing | safe | In a constructor or in the value of a property, no method of `this` is called and `this` is not handed over: the object is not complete |
| `no-ambient` | typing | safe | No `declare`, and no declaration file of the project outside an unsafe directory |
| `no-external-import` | typing | safe | Dependencies (npm, `node:*`) are imported from an unsafe directory only |
| `no-ts-directive` | typing | all | No `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck`, unsafe directories included |
| `unsafe-boundary` | typing | unsafe | The functions an unsafe directory exports return `Result` or `Option`, and leak no `any` |
| `safety-comment` | typing | unsafe | An `any`, a cast, a `!`, a written predicate or a `declare` has `// SAFETY: <reason>` right above |
| `strict-compiler-options` | typing | project | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride` |
| `unread-sources` | typing | project | A source the gate does not read (`.vue`, `.svelte`, `.astro`) is refused as a whole: nothing in it is checked |
| `no-throw` | errors | safe | No `throw`: errors are values (`Result`) |
| `no-null` | errors | safe | No `null`, as a value or as a type. Comparing with `=== null` stays allowed |
| `must-use` | errors | all | A `Result`, an `Option` or a `Promise` is not ignored. To drop one on purpose: `void expr` |
| `exhaustive-switch` | errors | all | A `switch` covers every member of a finite union, or has a `default` |
| `no-throwing-call` | errors | all | A call that may throw without its type saying so (a library function the effects ledger does not show to be safe, any function of a package that is not allowed) is made inside `attempt`, or in a `try` with a `catch` |
| `no-throwing-operator` | errors | all | An operator or a read that may throw on what its operands may be (a bigint `/`, `%` or `**`, the conversion of a value that is not plain in a template, a `+` or a comparison, an array length that is not a literal, a property of the library that runs code) is written in a `try` with a `catch` |
| `freeze-fresh` | errors | all | `Object.freeze`, `seal` and `preventExtensions` are given a value where it is made (a literal, a `new`), so that no name still says it can be changed |
| `use-once` | ownership | all | A value typed `Once<…>` has one owner: it is used through its members, given away exactly once (to a parameter or a return type that is `Once<…>`), and never lost. Giving it away in a loop, a `try`, a condition inside an expression or a closure is refused |
| `no-param-mutation` | mutability | safe | A function does not change a parameter unless it is typed `Mut<T>`: not by its name, not by another name for it or for a part of it, not by a function of the platform. The object a method is called on is one of the things it receives: a method that changes it says `this: Mut<…>`, Rust's `&mut self` |
| `mut-from-readonly` | mutability | safe | What is given where `Mut<…>` is asked for is the giver's to change: not a parameter that does not ask for mutation, not a value typed read-only. As an argument, a returned value, a property or an element of what is written in place, the right side of an assignment, the receiver of a method that says `this: Mut<…>`; and a function that writes its parameter is not given where one that does not is asked for |
| `readonly-types` | mutability | safe | A written type is read-only (`readonly T[]`, `ReadonlyMap`, `readonly` properties) unless under `Mut<…>` |
| `pure-domain` | mutability | safe | In a directory listed in `pureDirs`: no clock, randomness, console, network or module-level state, and no import from outside the pure directories |

The compiler's own errors are reported too, as `TS2322` and the like. There is no comment that silences a rule, by
design: what cannot conform goes to an unsafe directory with its reason, or to the baseline.

## Ownership: a value with one owner

A transaction that is neither committed nor rolled back, a lock released twice, a handle used after it was closed:
all compile. `Once<T>` marks a value that has one owner and is given away exactly once, as a value Rust moves.

```ts
import { end, type Once } from '@strict-ts/std';

export function begin(): Once<Transaction> { … }
export function commit(tx: Once<Transaction>): Result<void, DbError> { const raw = end(tx); … }

const tx = begin();
tx.query('…');                        // used through its members: fine
if (failed) return err('failed');     // refused: `tx` is not given away before this `return`
commit(tx);
tx.query('…');                        // refused: `tx` is used after it was given away
```

The rule `use-once` accepts a small subset, which it can prove: a value given away in plain sequence, or in both
branches of an `if`. In a loop, a `try`, a condition inside an expression or a closure, it refuses rather than guess.
