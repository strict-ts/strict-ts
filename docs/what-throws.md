# How strict-ts knows what throws

`no-throw` forbids writing `throw`. That is not enough: `JSON.parse(text)`, `new RegExp(source)`, `1n / 0n` and
`` `${value}` `` throw too, and their types do not say so. Two rules cover what a program calls and computes.

```
src/price.ts:4:10 no-throwing-call `Number.toFixed` throws a RangeError, as seen with -2147483648 · (2147483648).
src/price.ts:9:22 no-throwing-call `fetchRates` is declared in "rates-client", whose types do not say whether it throws.
src/price.ts:12:18 no-throwing-operator `/` throws a RangeError, as seen with 0n / 0n.
src/price.ts:15:31 no-throwing-operator A template throws a TypeError, as seen with `${Object.create(null)}`.
```

Each is accepted inside `attempt(() => …, onError)` or a `try` with a `catch`: the failure then becomes a `Result`.

What a function of the standard library does is not a list someone wrote. It is derived, by
[`packages/ledger`](../packages/ledger), from two readings that must agree:

| | How | What it gives |
|---|---|---|
| **Runs** | Each of 802 functions is called 600 times on values generated from the types of its parameters | « It threw, on this call », or « it never threw » |
| **The specification** | The ECMAScript specification is read, every `throw` and every failure handed on; where each value comes from is followed, and each check is asked of the declared types | « It has a way to throw », or « it has none » |

A function is called safe only when the specification gives it no way to throw **and** no run threw. It throws when
either says so. When the two disagree the other way (it threw, and the reading says it cannot), the build of the
ledger fails until the case is understood and written down. The operators are run the same way, on every pair of
kinds of operand, and only the combinations the compiler accepts are kept.

The DOM has no specification that can be read that way, so its functions are only run, in a browser: 764 were seen
to throw (`querySelector("")`, `createElement` on a name that is not one), and are refused like any other. 700 never
threw: that is not a proof, so they are refused too, unless the project writes `"assume": ["dom-as-observed"]`.
With that line, a function seen to throw is also accepted on arguments that are written in the call and have a
shape that was run in a browser: `classList.add("hidden")`, `querySelector("#menu")`, `createElement("canvas")`.

**Arguments written in the call.** `new RegExp('^a+$')`, `BigInt('12')` and `JSON.parse('{}')` throw on some
arguments, and not on these. When the compiler knows every argument (a literal, a constant, an object of those), the
gate runs the call and accepts it if it does not throw. A method on a receiver that is not written, `price.toFixed(2)`
or `date.toLocaleDateString('fr-FR')`, is run on a list of receivers of its class: that is accepted only when the
project writes `"assume": ["generated-receivers"]`.

A function that is not in the ledger is refused: Node, the parts of the DOM a bare page cannot run (audio, WebGL,
service workers), a package that is not in `allowedImports`.
