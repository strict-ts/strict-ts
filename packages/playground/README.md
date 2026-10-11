# @strict-ts/playground

strict-ts in the browser: five scenarios to edit, with their diagnostics as you type. Not published.

```sh
pnpm build            # at the root; or: pnpm --filter playground build
open packages/playground/dist/index.html
```

The build writes `dist/index.html`, with its data and its script inlined, and `dist/typescript.js` beside it. The page
loads nothing else: no server, no CDN, no font. It also writes `dist/playground.html`, the same page as one file of
about 10 MB with the compiler inside it, for where only one file can be put. That file is what is published as the
artifact « strict-ts Playground » of the Plane project:

```sh
pnpm build && plane artifact publish -p STS -t "strict-ts Playground" packages/playground/dist/playground.html
```

- `src/engine.ts` builds a TypeScript 6 program from the files held in the page and hands it to `@strict-ts/core`.
  It holds no rule.
- `src/app.ts` is the interface. `src/unsafe/page.ts` is where the page receives what the build hands it.
- `scripts/data.mjs` reads the scenarios from the repo: `examples/invoice`, core's fixtures, the sources of
  `packages/std`.
