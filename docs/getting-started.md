# Getting started

## What it looks like

Classic TypeScript, accepted by `tsc --strict`:

```ts
export function parseInvoice(json: string): Invoice {
  return JSON.parse(json) as Invoice;
}
```

```
invoice.ts:31:10 no-cast `as` cast forbidden.
  help: Use a type guard, `satisfies`, or validate the data in unsafe/.
invoice.ts:31:10 no-any This expression has type `any` (inferred).
  help: Move the call into unsafe/ and return a validated Result<unknown, E>.
```

Conforming: the call that can throw lives in an unsafe directory and returns a `Result`; the shape is proven by a
schema instead of asserted by a cast.

```ts
// src/unsafe/system.ts
export const parseJson = (text: string) => attempt((): unknown => JSON.parse(text), String);

// src/invoice.ts
export const parseInvoice = (json: string) => parseJson(json).andThen(Invoice.parse);
```

The whole example is in [`examples/invoice`](../examples/invoice): the classic version is 58 lines and is refused 22
times; the conforming one is 39 lines. A test keeps both numbers.

## Try it

```sh
corepack enable        # once: gives pnpm
pnpm install
pnpm build

node packages/cli/dist/main.js -p examples/invoice/strict     # exit code 0, nothing reported
node packages/cli/dist/main.js -p examples/invoice/classic    # exit code 1, 22 refusals
```

`pnpm build` also writes the playground to `packages/playground/dist`: open `index.html` in a browser to edit five
scenarios and read their diagnostics. It needs no server and no network.

## Examples

Four small programs, each written twice, classic and conforming, compiled, checked and run by the tests:
[`examples/`](../examples).

| Example | About |
|---|---|
| [`invoice`](../examples/invoice) | Typing and errors: the challenge above, 58 lines against 39 |
| [`report`](../examples/report) | What throws without saying so: `JSON.parse`, a pattern, a bigint division, a template |
| [`cart`](../examples/cart) | Explicit mutability: who changes what, and a pure directory |
| [`transfer`](../examples/transfer) | Ownership: a transaction with one owner |
