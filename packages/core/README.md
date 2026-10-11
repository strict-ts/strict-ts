# @strict-ts/core

The rule engine of strict-ts. It imports nothing from Node and nothing from a TypeScript version, so the same rules
run in the command line, in the editor and in the browser.

```ts
import { check, defaultConfig } from '@strict-ts/core';
import { createTypeScript6Provider } from '@strict-ts/core/typescript6';
import ts from '@typescript/typescript6';

const provider = createTypeScript6Provider(ts, program, { rootDir: '/path/to/project' });
const refused = check(provider, defaultConfig); // readonly Diagnostic[], the compiler's own errors included
```

## How it is built

| File | What it holds |
|---|---|
| `src/syntax.ts` | The syntax a rule reads: a neutral tree that names only what rules tell apart (`call`, `as`, `switch`, `property`, `binary`, `template`, and for the rules that follow a function: `block`, `variable`, `function`, `if`, `return`); everything else is `other` |
| `src/provider.ts` | `TypeProvider`: the files to check; what a rule may ask about a type (`isAny`, `members`, `awaited`, `property`, `returns`, `kinds`: the kinds of value it admits, `isOnce`); what a call reaches (`calleeOf`) and what type a place expects (`expectedOf`) |
| `src/effects/` | The effects ledger: each function of the standard library with its verdict and its evidence, the operators and the accessors that throw. `generated.ts` (ECMAScript) and `dom.ts` (the DOM, as seen in a browser) are written by `packages/ledger`; `seed.ts` holds what is classified by hand. Read by `no-throwing-call` and `no-throwing-operator` |
| `src/unsafe/run.ts` | The one place where core runs anything: a function of the language, found by its name, on arguments written in a call. What it throws leaves as a value |
| `src/config.ts` | `Config`: the unsafe, pure and test directories, the allowed packages, what the project assumes |
| `src/rule.ts` | `Rule`: a name, the guarantee it serves, a scope, and the hooks `visit` (every node), `file`, `project` |
| `src/engine.ts` | `check`: runs the rules on a provider and sorts what they report |
| `src/rules/` | One file per rule; `index.ts` is the catalogue. `caught.ts` says whether a throw is caught where it is written; `use-once.ts` follows each function, from its parameters to each of its ends |
| `src/typescript6/provider.ts` | The only file that knows a compiler. It imports TypeScript's types only, and receives the compiler from its caller |

A rule never sees a compiler node: moving to another TypeScript API means writing another provider, not touching a
rule. `test/architecture.test.ts` fails if anything else imports a compiler or uses a Node global.

## Adding a rule

1. Write its RFC (Plane, « RFC · Template »): the guarantee, one refused example and its fix, the cost in lines
   measured on the examples, the known false positives.
2. Add `src/rules/<name>.ts` and put it **at the end** of the catalogue in `src/rules/index.ts`: hosts number the
   rules by their place.
3. If it needs a shape the tree does not name, add the kind to `src/syntax.ts` and fill it in the provider.
4. Say whether it runs in tests: a rule about exceptions or imports sets `inTests: false`.
5. Test it in `test/rules.test.ts` with a refused and an accepted example, and add a marked line to
   `test/fixtures/violations` (`// expect: <name>`).
6. Regenerate the configuration schema: `pnpm --filter @strict-ts/cli schema`.

When a rule cannot tell, it refuses.
