# Known limits

strict-ts refuses when it is not sure, but these are accepted today although the types do not cover them:

- **The two reviews list known ways, and are not proofs.** Of 31 known ways to make a value differ from its type
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
- **Explicit mutability is a list of known ways too.** Of 24 known ways to change what a function did not make and
  that does not say `Mut`, the rules refuse 23. The last is outside the guarantee: whoever made a value may change
  it while someone else reads it as read-only (`const list = [1]; const view: readonly number[] = list;
  list.push(2)`). That is aliasing, which Rust refuses with its borrow checker and strict-ts does not. Each is a
  file of `packages/core/test/fixtures/mutations`.
- `no-param-mutation` does not see a write straight into what a call gave back, with no name for it
  (`current().count += 1`), nor into a new container of what a call gave (`[...current()]`). What a library gives
  back may be written: its types say nothing either way.
- A function written with an arrow in a constructor may change the object later, without anything saying so: the
  constructor may write `this`, and the arrow has its `this`. A getter cannot say `this: Mut<…>`, so a getter that
  writes (a value computed once and kept) is refused.
- `mut-from-readonly` compares the properties of what is given with those of what is asked three levels deep, and
  not the elements of an array that is not written in place.
- `no-param-mutation` follows a local name made from a parameter, not what `map` gives.
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
