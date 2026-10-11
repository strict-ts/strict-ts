# strict-ts — agent notes

- Goal: TypeScript and JavaScript as safe as Rust, without a new language or compiler. Every rule serves one of the
  five guarantees (memory, typing, errors, mutability, ownership); the table in the README is the scoreboard.
- Work, docs and specs are in Plane, project `STS` (`plane next -p STS`, `plane show STS-n`, `plane page list -p STS`).
  This repo holds code, pull requests and CI only: no backlog, roadmap or spec files here. Commits say `Refs STS-n`,
  or `Closes STS-n` when the task is done.
- Everything is written in English: code, comments, commits, Plane.
- Before a push: `pnpm lint && pnpm build && pnpm test && pnpm check && pnpm corpus` (pnpm comes from
  `corepack enable`; without it, `corepack pnpm …`). One task = one branch = one pull request into `main`.

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
