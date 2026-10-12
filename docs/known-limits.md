# Known limits

strict-ts refuses when it is not sure, but these are accepted today although the types do not cover them:

- **The unsound corners of TypeScript are closed as far as they are known.** strict-ts closes the doors a
  programmer opens on purpose (`any`, a cast, `!`, `declare`, a written predicate) and what the compiler lets
  through by design: of 23 known ways to make a value differ from its type without any of those, it refuses 22.
  The last is a constant read through a function before the line that declares it, which throws. Each attack is a
  file of `packages/core/test/fixtures/attacks` that prints `BROKEN` when it is run, and
  `packages/core/test/attacks.test.ts` records which ones are refused. This is a list of known ways, not a proof
  that there is no other.
- **An error can still escape its type in two known ways.** Of 27 ways for safe code to throw or to reject with no
  `throw` written, the rules refuse 24. What passes: a constant read before the line that declares it, in one file
  or across two that import each other. A third is outside the guarantee: a function that calls itself without
  end, as a stack overflow is outside Rust's. Each is a file of `packages/core/test/fixtures/escapes`, and
  `packages/core/test/escapes.test.ts` records which ones are refused.
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
- A value typed read-only can still reach a mutable type through a property of an object literal or the right side
  of an assignment: `mut-from-readonly` looks at arguments, initializers and returned values.
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
