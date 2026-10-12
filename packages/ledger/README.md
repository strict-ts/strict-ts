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

## The DOM

The DOM has no specification this project reads as it reads ECMAScript's: its algorithms are spread over dozens of
documents, in prose. So for the DOM the runs are all there is.

```sh
CHROME=/path/to/chrome-headless-shell node scripts/dom.mjs    # writes packages/core/src/effects/dom.ts
```

`scripts/dom.mjs` reads the 2,986 functions the compiler's DOM libraries declare, and calls them in a Chromium that
runs without a window, 80 times each, on values generated from their types. A page is made for the functions of
each interface (`scripts/dom-page.js`), with objects of the page to call them on and to give them: elements, a
canvas and its context, a request, an event, storage. When a page gives nothing back, its functions are run again
by halves until the one that kills it is alone.

| What was seen | Functions | In the ledger |
|---|---|---|
| Threw | 764 | `throws`, with the call: `querySelector("")`, `createElement("%E0%A4%A")`, `classList.add("")` |
| Never threw | 700 | `total` with `observedOnly`: **refused**, unless the project writes `"assume": ["dom-as-observed"]` |
| No object of the page to call it on | 1,440 | Nothing: refused. Audio, WebGL, WebRTC, service workers, and whatever a bare page does not have |
| Killed the page, or was never called on purpose | 47 | Nothing: `alert`, `document.write`, `location.reload` |
| Found, and no call could be made: an argument it needs could not be | 35 | Nothing: refused |

A function that never threw in 80 calls is not shown not to throw: `localStorage.setItem` never did, and throws when
storage is full. That one is in the ledger by hand, and a hand entry that says `throws` is kept. For the rest, taking
the runs as enough is a risk a project takes in writing, with the line above.

It needs a browser, which the CI does not have: `dom.ts` is kept in the repo and regenerated by hand. `pnpm ledger`
does not check it.

### Arguments written in the call

`classList.add("")` throws, and `classList.add("hidden")` does not. A function seen to throw is refused whatever it
is given, and most calls into the DOM give it something harmless, written in the call. The standard library is run
by the gate on such arguments; the gate has no DOM to run these in.

```sh
CHROME=/path/to/chrome node scripts/dom-shapes.mjs    # writes packages/core/src/effects/dom-shapes.ts
```

So for fourteen functions a person wrote, from the DOM standard, the **shape** of the arguments on which the function
does not throw, each narrower than what the browser accepts (`packages/core/src/effects/shapes.ts`):

| Shape | What has it | For |
|---|---|---|
| `token` | A text that is not empty and has no ASCII whitespace | `classList.add`, `remove`, `toggle`, `replace` |
| `element-name` | Lower-case letters and digits, in parts joined by hyphens | `document.createElement` |
| `attribute-name` | `role`, `aria-…`, `data-…` | `setAttribute` (with any text as the value) |
| `selector` | Names, `#id`, `.class`, `[attribute]`, `[attribute="value"]`, combinators, commas | `querySelector`, `querySelectorAll`, `closest`, `matches` |
| `unit`, `colour` | A number from 0 to 1; `#rgb` to `#rrggbbaa`, `rgb(…)`, `rgba(…)` | `addColorStop` |
| `header-name` | ASCII letters and digits, in parts joined by hyphens | `Headers.get`, `has` |
| `text`, `response-init` | Any text; an object with a `status` from 200 to 599 that is not 204, 205 or 304, and `headers` written as an object of header names and printable ASCII | `new Response` |

`text` is the one shape every value of a type has: an argument typed as a text passes it without being written in
the call, since any text was given in the browser.

`scripts/dom-shapes.mjs` then makes 600 lists of arguments for each function, keeps those the shape lets through
(the predicate it runs is the one the rule runs), and calls the function with each in a browser, on every object of
the page it can be called on: 49,200 calls. An entry is written only if none threw; a shape that lets through one
argument the browser refuses fails the script, with the call.

What a shape leaves out is refused as before, and nothing is said of it: a pseudo-class in a selector, a colour by
its name, an attribute that runs or loads something (`onclick`, `src`), where a page can make the browser refuse a
text. Like everything known of the DOM, this was seen and not read by the tool: it counts for a project that writes
`"assume": ["dom-as-observed"]`.

## What it does not do

- It runs 802 of the 844 functions. The rest is `Intl`, which another specification defines, and the interfaces a
  caller implements (a proxy handler, an iterator): they are refused. One is in the ledger by hand, as throwing:
  `Intl.DateTimeFormat.format`, which throws on a date that is not one and does not without an argument.
- `confirm` is never run, since it waits for a person. It is in the ledger by hand: the HTML standard gives it no
  step that throws. `alert` and `prompt` are not.
- **Three lists are still a judgement**: the operations taken to run the caller's own code, the checks of the
  receiver's class, the sizes no machine holds. A write to a frozen object is taken for a plain write.
- Node has no specification this reads, and nothing runs it: its functions are refused.
- A result too long for the engine (`Invalid string length`) is a limit of the machine, like running out of memory,
  and is not counted as an exception.
- A generated value may not fit a type the generator reads too loosely; the function then gets `throws` when it does
  not deserve it. That errs on the side of refusing.
