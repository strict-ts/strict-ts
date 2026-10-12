<p align="center"><img src="assets/logo.svg" alt="strict-ts" width="320"></p>

[![CI](https://git.cf.adserver.fr/Alex/strict-ts/actions/workflows/ci.yml/badge.svg?branch=main)](https://git.cf.adserver.fr/Alex/strict-ts/actions)

# strict-ts

[Getting started](docs/getting-started.md) |
[Rules](docs/rules.md) |
[Configure](docs/configuration.md) |
[Adopt on existing code](docs/adopting.md) |
[Known limits](docs/known-limits.md) |
[Contribute](CONTRIBUTING.md)

strict-ts makes TypeScript and JavaScript as safe as Rust: a program it accepts must not be able to fail for a reason
its types do not announce.

- It is a checker, not a language. The code stays standard TypeScript that `tsc` compiles as is.
- `strict-ts` runs in place of `tsc --noEmit`: it reports the compiler's errors and adds its own rules.
- Unchecked code lives in one place, the unsafe directories, and says why it holds.
- An analysis that is not sure refuses the code. It never declares it safe.

## Table of contents

1. [The five guarantees](#the-five-guarantees)
2. [Installation and usage](#installation-and-usage)
3. [Configuration](#configuration)
4. [Documentation](#documentation)
5. [Frequently asked questions](#frequently-asked-questions)
6. [Versions](#versions)
7. [Contribute](#contribute)
8. [Roadmap](#roadmap)
9. [License](#license)

## The five guarantees

Rust's safety rests on five guarantees. JavaScript already has one, memory, thanks to the garbage collector. strict-ts
brings the other four, one rule at a time. This table is the project's scoreboard.

| Rust guarantee | Equivalent in TS/JS | Status |
|---|---|---|
| Memory safety | The runtime's garbage collector | Acquired |
| Safe typing, nothing unchecked outside `unsafe` | No `any`, cast, `declare` or `@ts-ignore` outside `unsafe/`; a `// SAFETY:` reason inside | Acquired |
| No null, errors in the types | `Option`, `Result`, `no-throw`, `must-use`; a call or an operator that may throw is caught where it is written | Acquired |
| Explicit mutability | Types read-only unless they say `Mut<T>`. A function changes only what it made, or what says `Mut`: a parameter, `this`, what another function hands out | Prototype |
| Ownership, no uncontrolled concurrent access | A value typed `Once<T>` has one owner and is given away exactly once (`use-once`). State shared across `await` and workers: nothing yet | Research: a first rule, on a small subset |

« Acquired » has a narrow meaning here: **no way around the guarantee is known in checked code.** Each way that was
found is a file that fails when it is run, kept in the tests with the rule that refuses it: 32 for safe typing, 29
for errors in the types. It is a list and not a proof, the lists were written by who wrote the rules, and what is
taken on trust (the specification as it was read, the browser as it was run, the types of the packages a project
allows) is in [Known limits](docs/known-limits.md). « Prototype » means the rules exist and are tested, and ways
around them are still being found: explicit mutability went from 2 known ways refused to 46 in three rounds, and
the third found twelve after an application had already been made to pass.

## Installation and usage

Prerequisites: [Node.js](https://nodejs.org/) 22.13 or later, and a project with a `tsconfig.json`.

The packages are on the npm registry of the Gitea:

```sh
echo "@strict-ts:registry=https://git.cf.adserver.fr/api/packages/Alex/npm/" >> .npmrc
npm install -D @strict-ts/cli @strict-ts/codemod
npm install @strict-ts/std
```

`@strict-ts/cli` is the gate, `@strict-ts/codemod` the fixer (`strict-ts-fix`), `@strict-ts/std` what conforming code
is written with.

Then run it where `tsc --noEmit` ran:

```sh
npx strict-ts -p .
```

It prints one line per refusal, and a `help:` line below:

```
invoice.ts:31:10 no-cast `as` cast forbidden.
  help: Use a type guard, `satisfies`, or validate the data in unsafe/.
```

The exit code is 0 when nothing is refused, 1 when something is, 2 when the project could not be checked. The options
and the JSON and SARIF outputs are in [The command line](docs/cli.md). To run it from this repo instead, see
[Getting started](docs/getting-started.md).

## Configuration

An optional `strict-ts.json` beside `tsconfig.json`. Every key is optional:

```json
{
  "unsafeDirs": ["src/unsafe"],
  "allowedImports": ["@strict-ts/std"],
  "pureDirs": ["src/domain"]
}
```

`unsafeDirs` are the only directories where a cast, `any`, `throw` or an external import may live;
`allowedImports` are the packages safe code may import; `pureDirs` hold code that must be pure. Every key is described
in [Configuration](docs/configuration.md).

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

## Frequently asked questions

### Is it a new language, or a new compiler?

No. A program strict-ts accepts is TypeScript that `tsc` compiles as is, and the JavaScript that comes out is the
same. What conforming code is written with, `Result`, `Option`, schemas, is an ordinary library,
[`@strict-ts/std`](docs/standard-library.md).

### Can I use it on code that was not written for it?

Yes: record today's refusals in a [baseline](docs/adopting.md), and the gate only fails on what is new. A fixer
applies the fixes that are mechanical.

### How do I silence a rule on one line?

You cannot, by design. What cannot conform goes to an [unsafe directory](docs/unsafe-directories.md) with a
`// SAFETY:` reason, or to the baseline.

### Does it replace my linter?

No. It replaces `tsc --noEmit` in the CI. Three of its rules also exist as an
[Oxlint plugin](packages/oxlint-plugin), for a quick first answer.

### Which versions of TypeScript does it support?

It checks with the TypeScript 6 API, which it brings itself. The [editor plugin](docs/editor.md) needs an editor that
runs TypeScript 6 or earlier.

### Is my program proven safe once it passes?

No. Two guarantees are « Acquired », which says that no way around them is known in checked code, not that there is
none: they rest on lists of attacks, not on proofs. What is taken on trust, and what is still accepted, is in
[Known limits](docs/known-limits.md).

## Versions

Semantic versioning is followed strictly from 1.0. A rule that starts refusing code it accepted is a breaking
change, and waits for the next major version; one that stops refusing code it should not have is a fix. What each
version holds is in the [changelog](CHANGELOG.md).

Each commit of `main` that passes the CI is also published as a pilot version, named after its commit
(`0.0.0-pilot.<time>.g<commit>`) under the tag `pilot`: it is not a release, and a rule may start refusing more
from one to the next. `npm install -D @strict-ts/cli@pilot` takes the latest.

## Contribute

A new rule starts with a short RFC. How to build, test and propose a change is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

The roadmap, the specs and one RFC page per rule are in Plane, project
[STS](https://plane.adserver.fr/alex/projects/2c1f2990-e14d-4f3d-9186-ebbe292b8c8f/issues/).

## License

[MIT](LICENSE).
