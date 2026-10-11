# @strict-ts/playground

strict-ts in the browser: five scenarios to edit, with their diagnostics as you type. Not published.

```sh
pnpm build            # at the root; or: pnpm --filter playground build
open packages/playground/dist/index.html
```

The build writes `dist/index.html`, with its data and its script inlined, and `dist/typescript.js` beside it. The page
loads nothing else: no server, no CDN, no font.

- `src/engine.ts` builds a TypeScript 6 program from the files held in the page and hands it to `@strict-ts/core`.
  It holds no rule.
- `src/app.ts` is the interface. `src/unsafe/page.ts` is where the page receives what the build hands it.
- `scripts/data.mjs` reads the scenarios from the repo: `examples/invoice`, core's fixtures, the sources of
  `packages/std`.
