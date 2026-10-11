# strict-ts

Make TypeScript and JavaScript as safe as Rust. A program accepted by strict-ts must not be able to fail for a reason
its types do not announce.

Rust's safety rests on five guarantees. JavaScript already has one, memory, thanks to the garbage collector. strict-ts
brings the other four without changing language: the code stays standard TypeScript that `tsc` compiles as is.

| Rust guarantee | Equivalent in TS/JS | Status |
|---|---|---|
| Memory safety | The runtime's garbage collector | Acquired |
| Safe typing, nothing unchecked outside `unsafe` | No `any`, cast or `@ts-ignore` outside `unsafe/`; a `// SAFETY:` reason inside | Prototype |
| No null, errors in the types | `Option`, `Result`, `no-throw`, `must-use` | Prototype |
| Explicit mutability | `readonly` by default, no mutation of parameters | To do |
| Ownership, no uncontrolled concurrent access | Single-use resources, state shared across `await` and workers | Research |

## Packages

| Package | Role | State |
|---|---|---|
| [`@strict-ts/core`](packages/core) | The rule engine, with no dependency on Node | 14 rules behind `TypeProvider`, TypeScript 6 provider |
| [`@strict-ts/cli`](packages/cli) | The CI gate: baseline, JSON and SARIF output, incremental cache | text, JSON and SARIF output, `strict-ts.json`, baseline |
| [`@strict-ts/std`](packages/std) | `Result`, `Option`, schemas, `panic`, `readonly`-by-default types | `Result`, `Option`, schemas and `panic`; see [`examples/invoice`](examples/invoice) |
| [`@strict-ts/playground`](packages/playground) | strict-ts in the browser, on the five scenarios; not published | builds to one page |
| [`@strict-ts/language-service`](packages/language-service) | Errors underlined in the editor | TypeScript language service plugin, tested outside an editor |
| `@strict-ts/codemod` | Automatic fixes and migration of existing code | phase 1 |
| [`@strict-ts/wrap`](packages/wrap) | Generates the `unsafe/` wrappers from `.d.ts` files | functions and constants; classes and objects left out |
| `@strict-ts/flow` | Flow analysis: single use, mutations across `await` | phase 3 |

Nothing is published on npm yet.

## Working on it

```sh
corepack enable        # once: gives pnpm
pnpm install
pnpm lint && pnpm build && pnpm test && pnpm check
```

`pnpm check` runs strict-ts on its own packages, as the CI does: all pass with nothing recorded, except `std`, whose
baseline (`strict-ts-baseline.json`) can only shrink.

To run the gate on a project, here the two versions of the invoice challenge:

```sh
node packages/cli/dist/main.js -p examples/invoice/strict     # exit code 0, nothing reported
node packages/cli/dist/main.js -p examples/invoice/classic    # exit code 1, 9 refusals
```

`-p` takes a `tsconfig.json` or its directory; `--format json` prints one JSON document, `--format sarif` a SARIF
2.1.0 log for code-scanning views, and `--output <file>` writes the report to a file. An optional `strict-ts.json`
beside `tsconfig.json` sets `unsafeDirs`, `allowedImports`, `rules` and `baseline`. Exit code 2 means the project
could not be checked.

`--update-baseline` records today's violations in `strict-ts-baseline.json`, a count per rule per file, and exits
with 0. From then on the gate refuses only what goes beyond that record; `--no-baseline` shows everything. An entry
that allows more than what is found is stale: a warning, or a failure with `--strict-baseline`, so that in CI the
record can only shrink.

`pnpm build` also writes the playground to `packages/playground/dist`: open `index.html` in a browser, it needs no
server and no network.

To see the same refusals in the editor, add the plugin to the project's `tsconfig.json` and use the workspace's
TypeScript (the plugin API exists up to TypeScript 6):

```json
{ "compilerOptions": { "plugins": [{ "name": "@strict-ts/language-service" }] } }
```

To wrap a dependency instead of writing its `unsafe/` file by hand:

```sh
node packages/wrap/dist/main.js node:path -p packages/cli -o src/unsafe/path.ts
```

Every function of the module then returns a `Result`; a result of type `any` becomes `unknown`, one that may be null
or undefined an `Option`. Classes and objects with methods are listed in the file's header as not wrapped.

Node ≥ 22.13. The work (backlog, milestones, sprints) and the docs and specs are in Plane, project
[STS](https://plane.adserver.fr/alex/projects/2c1f2990-e14d-4f3d-9186-ebbe292b8c8f/issues/); this repo holds the code,
the pull requests and the CI.

## License

MIT.
