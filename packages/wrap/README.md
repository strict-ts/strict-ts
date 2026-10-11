# @strict-ts/wrap

Generates the `unsafe/` wrapper of a dependency from its declaration files.

```sh
strict-ts-wrap node:path -p . -o src/unsafe/path.ts
```

```ts
export const join = (...args: Parameters<typeof lib.join>) => attempt(() => lib.join(...args), threw('join'));
```

- Every function goes through `attempt`: declarations do not say which ones throw, so all of them may.
- A result of type `any` becomes `unknown`; one that may be null or undefined becomes an `Option`; both inside a
  promise too.
- Constants of a primitive type are re-exported.
- The error is a value: `{ kind: 'threw', from: 'node:path.join', message }`.
- The generated file holds no cast and passes the gate as it is.

## Limits

- Classes, and objects with methods (`fs.promises`), are not wrapped. The header of the generated file lists them.
- An overloaded function keeps its last signature only; a generic one loses its type parameters. A comment above the
  wrapper says so.
- A function that returns an object hands its methods over unwrapped.
