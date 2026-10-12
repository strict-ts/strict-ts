# Unsafe directories

`unsafe/` is to strict-ts what `unsafe` is to Rust: the only place where unchecked code may live. By default it is
`src/unsafe`. Inside, casts, `any`, `throw` and external imports are allowed, on two conditions:

- what the directory exports returns `Result` or `Option` (`unsafe-boundary`), so that an error can only cross as a
  value;
- each unchecked construct says why it holds:

```ts
// SAFETY: a non-null object that is not an array has string keys, and its values are read as unknown.
export const asRecord = (value: unknown): Option<Readonly<Record<string, unknown>>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? some(value as Readonly<Record<string, unknown>>) : none;
```

A call that may throw is caught where it is written, in the unsafe directory too: inside `attempt(() => …)` or a
`try` with a `catch`, in the same function. A function given to something else is another function: what it throws
when it is called later is caught by nobody, which is the case of every callback of an event emitter.

```ts
stream.on('data', (data: Buffer) => {
  try {
    received += data.toString();
  } catch (cause) {
    settle(err(textOf(cause)));
  }
});
```

To wrap a whole dependency instead of writing its file by hand:

```sh
node packages/wrap/dist/main.js node:path -p packages/cli -o src/unsafe/path.ts
```

Every function of the module then returns a `Result`; a result of type `any` becomes `unknown`, one that may be null
or undefined an `Option`. Classes and objects with methods are not wrapped: the header of the generated file lists
them.
