# strict-ts — agent notes

- Goal: TypeScript and JavaScript as safe as Rust, without a new language or compiler. Every rule serves one of the
  five guarantees (memory, typing, errors, mutability, ownership); the table in the README is the scoreboard.
- Work, docs and specs are in Plane, project `STS` (`plane next -p STS`, `plane show STS-n`, `plane page list -p STS`).
  This repo holds code, pull requests and CI only: no backlog, roadmap or spec files here. Commits say `Refs STS-n`,
  or `Closes STS-n` when the task is done.
- The README is the front page: what strict-ts is, the table of guarantees, how to install, and links. How to use
  it (rules, command line, configuration, adoption, limits) is in `docs/`, one file per subject, changed in the same
  pull request as the code it describes. `CONTRIBUTING.md` says how to work on the repo.
- `packages/site` is the website (`pnpm build && pnpm site`, then `pnpm site:serve`): the front page, `docs/` as pages,
  the playground of `packages/playground` as one of its pages (there is no other playground, and no artifact). It takes its texts from `README.md` and `docs/`: a heading, a
  figure or a block changed there is checked by its test. It is on Coolify (application `strict-ts`, built from the
  `Dockerfile` at the root) at `https://strict-ts.adserver.fr`; a push to `main` deploys it again.
- Everything is written in English: code, comments, commits, Plane.
- Before a push: `pnpm lint && pnpm build && pnpm test && pnpm check && pnpm corpus && pnpm probe &&
  pnpm ledger` (pnpm comes from `corepack enable`; without it, `corepack pnpm …`). One task = one branch = one pull request into `main`.

## Architecture rules

- `@strict-ts/core` imports nothing from Node and nothing from a given TypeScript version. Rules read the program
  through the `TypeProvider` interface; each TypeScript API (TS 6 through `@typescript/typescript6` today, TS 7.1 when
  it ships) is one implementation of it, outside the rules.
- `@strict-ts/std` is a runtime library and never depends on the checker.
- The CLI, the editor plugin and the playground are adapters around `core`: no rule logic in them.
- A new rule starts with a short RFC (Plane page « RFC · <rule> »): the Rust guarantee it serves, one refused example
  and its fix, the cost in lines measured on the examples, the known false positives.
- An analysis that is not sure refuses the code. It never declares it safe.
- strict-ts checks itself: no `any`, cast, `@ts-ignore` or `throw` in the packages once the rules exist.
