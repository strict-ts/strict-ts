# @strict-ts/playground

strict-ts in the browser: eleven scenarios to edit (the four examples of the repo, classic and conforming), with their diagnostics as you type. Not published.

It is a page of the website, and of nothing else: [`@strict-ts/site`](../site) puts what this package hands over
under its own bar, at `playground.html`. There is no page built alone, and no artifact.

```sh
pnpm build && pnpm site      # at the root
pnpm site:serve              # http://127.0.0.1:4173/playground.html
```

- `src/engine.ts` builds a TypeScript 6 program from the files held in the page and hands it to `@strict-ts/core`.
  It holds no rule. The front page of the site judges its samples with it too.
- `src/app.ts` is the interface. `src/unsafe/page.ts` is where the page receives what the build hands it.
- `src/page.html` is the style and the markup. They go in a shadow tree of the site's page, so that this sheet and
  the site's do not meet; the theme the site was given is told to the host of the tree.
- `scripts/page.mjs` gives the site the parts: that fragment, the data, the script, and where the compiler is.
- `scripts/data.mjs` reads the scenarios from the repo: `examples/`, core's fixtures, the sources of
  `packages/std`.
