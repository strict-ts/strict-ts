# Known limits

strict-ts refuses when it is not sure, but these are accepted today although the types do not cover them:

- **The two reviews list known ways, and are not proofs.** Of 32 known ways to make a value differ from its type
  with no `any`, cast, `!` or `declare`, and of 29 known ways for safe code to throw or to reject with no `throw`
  written, the rules refuse all but one: a function that calls itself without end, which is outside the guarantee
  as a stack overflow is outside Rust's. They were written by who wrote the rules. Each is a file of `packages/core/test/fixtures/attacks` or
  `fixtures/escapes` that fails when it is run, and a test records which rule refuses it. What nobody thought of
  is not in the list.
- The effects ledger proves ECMAScript only. The DOM is run in a browser and not read: a function that never threw
  there is refused unless the project writes `"assume": ["dom-as-observed"]`, which is taking 80 calls for a proof.
  Node and `Intl` are neither read nor run: their functions are refused. A method of a typed array throws once its buffer is detached: it is refused
  unless the project writes `"assume": ["attached-buffers"]`.
- A single-file component (`.vue`, `.svelte`, `.astro`) is not read. `unread-sources` refuses each one, so that a
  project does not pass with code nobody checked; accepting them in the baseline is saying so in writing. The CLI
  finds those the project's `include` and `exclude` would take if the compiler read them; the editor plugin and
  the playground do not look for them.
- A call that is run because its arguments are written is run in the gate's engine. The code may run in another,
  where a locale or a flag of a regular expression is missing.
- The reading of the specification still holds three short lists that are a judgement: the operations taken to run
  the caller's own code (a callback, a getter), the checks of the receiver's class, the sizes no machine holds.
- **Explicit mutability is a list of known ways too.** Of 71 known ways to change what a function did not make and
  that does not say `Mut`, the rules refuse 70. The last is outside the guarantee: whoever made a value may change
  it while someone else reads it as read-only (`const list = [1]; const view: readonly number[] = list;
  list.push(2)`). That is aliasing, which Rust refuses with its borrow checker and strict-ts does not. Each is a
  file of `packages/core/test/fixtures/mutations`. Nine rounds found them: the third twelve more after an
  application had already been made to pass, then eight, nine, eight, nine, six and six more, each a few hours
  after the one before. No round has yet found nothing: this list is younger than the two above, and still moving.
- **What a function of the library gives back is taken to be, perhaps, what it was given.** `Promise.resolve(value)`,
  `Array.of(value)`, `weak.deref()` hand back their argument or a part of it, and no type says so. So what such a
  call gives is followed back to everything it was given, unless it is a number or a text, a new list of them, or
  one of a short list of functions known to make something new (`structuredClone`, `JSON.parse`, `Object.keys`,
  `createElement`, …). That list is a judgement. The other way round, code that changes what a library function
  made out of a parameter is refused though it is right: `carts.reduce(…)` into an accumulator, then written.
- **Which methods of the platform change their object is a list of names**: those of arrays, maps and sets, of
  the nodes of a page, of a canvas that is drawn on, and any method named `set…`. A method that changes its object
  and is not on the list is taken to read it. A method the project wrote says it itself, with `this: Mut<…>`.
- **A constructor of the library or of a package is taken to make something new**, that holds nothing of what it
  was given to write through, except the collections (`new Map(other)`) and `Proxy`. `new Mesh(geometry, material)`
  then changed is not taken as a change of the material.
- **A method the project wrote is believed about what it keeps.** `grid.set(x, y, tile)` is taken to keep `tile`
  only if its parameter says `Mut<…>`: without it, the method cannot put the tile anywhere that may be written,
  and the rules check that where the method is written.
- What may be written is followed by what the types written in the project say: a field says `Mut<…>` for what it
  holds to be written, a list says it inside (`Mut<Mut<Line>[]>`). Where no type is written (an object or an array
  made in place, `typeof` a value), the rules follow the names instead, up to eight of them, and inside one
  function: what a helper puts in a list it is given is not followed.
- A method of a library that changes its object is known by its name (`push`, `set…`, `next`, `appendChild`…). One
  whose name says nothing is not seen: `pattern.exec(text)` moves the `lastIndex` of a pattern.
- `reset.bind(given)` makes a function that will write `given`; only `call` and `apply` are read.
- What a library gives back may be written: its types say nothing either way.
- A getter cannot say `this: Mut<…>`, nor can a function written with an arrow: one that writes its object (a
  value computed once and kept, a handler kept in a property) is refused, and becomes a method.
- `mut-from-readonly` compares what is given with what is asked three levels deep.
- `use-once` proves a small subset: a value given away in plain sequence or in both branches of an `if`. It trusts
  the methods of the value not to keep it, and the function that returns a `Once<T>` not to hand the same object out
  twice. A helper that only reads the value cannot borrow it: it takes it and gives it back.
- `no-throwing-operator` knows the operators and the accessors of ECMAScript, which were all read. Of the
  properties of the web platform that throw when they are read, it knows a list written by hand from the standards:
  `localStorage`, `sessionStorage`, `document.cookie`, the `result` and `error` of an `IDBRequest`, the
  `responseText` and `responseXML` of an `XMLHttpRequest`. Another one is not seen. Running out of stack or of
  memory is outside what any rule covers, as in Rust.
- Inferred types are not read by `readonly-types`: `const xs = [1, 2]` is a mutable local.
- A declaration file inside an unsafe directory is accepted whole.
- Only the TypeScript 6 API is supported.
