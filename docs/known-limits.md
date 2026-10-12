# Known limits

strict-ts refuses when it is not sure, but these are accepted today although the types do not cover them:

- **The two reviews list known ways, and are not proofs.** Of 29 known ways to make a value differ from its type
  with no `any`, cast, `!` or `declare`, and of 27 known ways for safe code to throw or to reject with no `throw`
  written, the rules refuse all but one: a function that calls itself without end, which is outside the guarantee
  as a stack overflow is outside Rust's. Each is a file of `packages/core/test/fixtures/attacks` or
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
- **Explicit mutability holds for the plain cases only.** Of 20 known ways to change a value its type says is
  read-only, or to change what a function receives without its parameter saying `Mut`, the rules refuse 18. A
  parameter is still changed by its own method (`counter.increment()`), and a local with no written type is
  mutable while someone else reads it as read-only. Each is a file of `packages/core/test/fixtures/mutations`.
- `mut-from-readonly` compares the properties of what is given with those of what is asked three levels deep, and
  not the elements of an array that is not written in place.
- `no-param-mutation` follows a local name made from a parameter, not what a function gives back
  (`const alias = same(given)`), nor what `map` gives.
- `use-once` proves a small subset: a value given away in plain sequence or in both branches of an `if`. It trusts
  the methods of the value not to keep it, and the function that returns a `Once<T>` not to hand the same object out
  twice. A helper that only reads the value cannot borrow it: it takes it and gives it back.
- `no-throwing-operator` knows the operators and the accessors of ECMAScript. A property of the DOM that throws when
  read (`localStorage` where storage is denied) is not seen, nor a variable read before its `let` has run. Running out of stack or of memory is outside what any rule covers, as in Rust.
- `unsafe-boundary` checks exported functions, not the methods of an exported object or class.
- Inferred types are not read by `readonly-types`: `const xs = [1, 2]` is a mutable local.
- A source file of the program outside the directory of `tsconfig.json` is compiled but not checked.
- A declaration file inside an unsafe directory is accepted whole.
- Only the TypeScript 6 API is supported.
