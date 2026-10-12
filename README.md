<p align="center"><img src="assets/logo.svg" alt="strict-ts" width="320"></p>

# strict-ts

[![CI](https://git.cf.adserver.fr/Alex/strict-ts/actions/workflows/ci.yml/badge.svg?branch=main)](https://git.cf.adserver.fr/Alex/strict-ts/actions)

[strict-ts](docs/getting-started.md) makes TypeScript and JavaScript as safe as Rust. A program it accepts must not be
able to fail for a reason its types do not announce. It is a checker, not a language: the code stays standard
TypeScript that `tsc` compiles as is. `strict-ts` runs in place of `tsc --noEmit`, reports the compiler's errors, and
adds its own [rules](docs/rules.md). Try it in the [playground](packages/playground), which `pnpm build` writes to
one page that needs no server.

## The five guarantees

Rust's safety rests on five guarantees. JavaScript already has one, memory, thanks to the garbage collector. strict-ts
brings the other four, one rule at a time. This table is the project's scoreboard.

| Rust guarantee | Equivalent in TS/JS | Status |
|---|---|---|
| Memory safety | The runtime's garbage collector | Acquired |
| Safe typing, nothing unchecked outside `unsafe` | No `any`, cast, `declare` or `@ts-ignore` outside `unsafe/`; a `// SAFETY:` reason inside | Prototype |
| No null, errors in the types | `Option`, `Result`, `no-throw`, `must-use`; a call or an operator that may throw is caught where it is written | Prototype |
| Explicit mutability | Types read-only unless they say `Mut<T>`, no mutation of parameters | Prototype |
| Ownership, no uncontrolled concurrent access | A value typed `Once<T>` has one owner and is given away exactly once (`use-once`). State shared across `await` and workers: nothing yet | Research: a first rule, on a small subset |

« Prototype » means the rules exist and are tested, and known ways around them remain (see
[Known limits](docs/known-limits.md)). No guarantee is « Acquired » by strict-ts yet.

## Installing

Nothing is released yet. Each commit of `main` that passes the CI is published as a pilot version on the npm registry
of the Gitea:

```sh
echo "@strict-ts:registry=https://git.cf.adserver.fr/api/packages/Alex/npm/" >> .npmrc
npm install -D @strict-ts/cli@pilot
npm install @strict-ts/std@pilot
npx strict-ts -p .
```

Or from this repo, see [Getting started](docs/getting-started.md).

## Documentation

- [Getting started](docs/getting-started.md): what a refusal looks like, the examples, a first run
- [The rules](docs/rules.md), and [how strict-ts knows what throws](docs/what-throws.md)
- [Unsafe directories](docs/unsafe-directories.md)
- [The standard library](docs/standard-library.md): `Result`, `Option`, schemas, `Mut`, `Once`
- [The command line](docs/cli.md) and [the configuration](docs/configuration.md)
- [Adopting it on existing code](docs/adopting.md): the baseline and the fixer
- [In the editor](docs/editor.md)
- [The probes](docs/probes.md): checking at run time what the gate took on trust
- [Packages](docs/packages.md)
- [Known limits](docs/known-limits.md)

## Contribute

A new rule starts with a short RFC. How to build, test and propose a change is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

The roadmap, the specs and one RFC page per rule are in Plane, project
[STS](https://plane.adserver.fr/alex/projects/2c1f2990-e14d-4f3d-9186-ebbe292b8c8f/issues/).

## License

[MIT](LICENSE).
