# @strict-ts/cli

The strict-ts gate: one command in place of `tsc --noEmit`. The options, the exit codes, the configuration and the
baseline are described in the [README of the repo](../../README.md).

```sh
strict-ts -p . --strict-baseline
```

The package holds no rule: it loads the program a `tsconfig.json` describes, hands it to `@strict-ts/core`, and prints
what comes back.

| File | What it holds |
|---|---|
| `src/args.ts` | The arguments. One it does not know is an error |
| `src/config.ts`, `src/config-schema.ts` | `strict-ts.json`: its validation, and its JSON schema, published as `strict-ts.schema.json` |
| `src/baseline.ts` | The baseline: counting, comparing, stale entries |
| `src/format.ts`, `src/sarif.ts` | The text, JSON and SARIF reports |
| `src/unsafe/` | The file system and the compiler: everything that may throw leaves there as a `Result` |

`@strict-ts/cli/settings` and `@strict-ts/cli/baseline` are exported for the other adapters, so that the editor reads
the same configuration with the same code.

After a change to the configuration or to the rule catalogue: `pnpm --filter @strict-ts/cli schema`.
