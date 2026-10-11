# strict-ts

Make TypeScript and JavaScript as safe as Rust. A program accepted by strict-ts must not be able to fail for a reason
its types do not announce.

Rust's safety rests on five guarantees. JavaScript already has one, memory, thanks to the garbage collector. strict-ts
brings the other four without changing language: the code stays standard TypeScript that `tsc` compiles as is.

| Rust guarantee | Equivalent in TS/JS | Status |
|---|---|---|
| Memory safety | The runtime's garbage collector | Acquired |
| Safe typing, nothing unchecked outside `unsafe` | No `any`, cast or `@ts-ignore` outside `unsafe/` | Prototype |
| No null, errors in the types | `Option`, `Result`, `no-throw`, `must-use` | Prototype |
| Explicit mutability | `readonly` by default, no mutation of parameters | To do |
| Ownership, no uncontrolled concurrent access | Single-use resources, state shared across `await` and workers | Research |

## Packages

| Package | Role | State |
|---|---|---|
| [`@strict-ts/core`](packages/core) | The rule engine, with no dependency on Node | skeleton |
| [`@strict-ts/cli`](packages/cli) | The CI gate: baseline, JSON and SARIF output, incremental cache | skeleton |
| [`@strict-ts/std`](packages/std) | `Result`, `Option`, schemas, `panic`, `readonly`-by-default types | skeleton |
| `@strict-ts/language-service` | Errors underlined in the editor | phase 1 |
| `@strict-ts/codemod` | Automatic fixes and migration of existing code | phase 1 |
| `@strict-ts/wrap` | Generates the `unsafe/` wrappers from `.d.ts` files | phase 1 |
| `@strict-ts/flow` | Flow analysis: single use, mutations across `await` | phase 3 |

Nothing is published on npm yet.

## Working on it

```sh
corepack enable        # once: gives pnpm
pnpm install
pnpm lint && pnpm build && pnpm test
```

Node ≥ 22.13. The work (backlog, milestones, sprints) and the docs and specs are in Plane, project
[STS](https://plane.adserver.fr/alex/projects/2c1f2990-e14d-4f3d-9186-ebbe292b8c8f/issues/); this repo holds the code,
the pull requests and the CI.

## License

MIT.
