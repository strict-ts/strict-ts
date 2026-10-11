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
| `src/syntax.ts` | The syntax a rule reads: a neutral tree that names only what rules tell apart (`call`, `as`, `switch`, `property`…); everything else is `other` |
| `src/provider.ts` | `TypeProvider`: the files to check, and what a rule may ask about a type (`isAny`, `members`, `awaited`, `property`, `returns`…) |
| `src/rules/throwing.ts` | The table of the standard library's functions that throw on what their types accept, read by `no-throwing-call` |
| `src/rule.ts` | `Rule`: a name, the guarantee it serves, a scope, and the hooks `visit` (every node), `file`, `project` |
| `src/engine.ts` | `check`: runs the rules on a provider and sorts what they report |
| `src/rules/` | One file per rule; `index.ts` is the catalogue |
| `src/typescript6/provider.ts` | The only file that knows a compiler. It imports TypeScript's types only, and receives the compiler from its caller |

A rule never sees a compiler node: moving to another TypeScript API means writing another provider, not touching a
rule. `test/architecture.test.ts` fails if anything else imports a compiler or uses a Node global.

## Adding a rule

1. Write its RFC (Plane, « RFC · Template »): the guarantee, one refused example and its fix, the cost in lines
   measured on the examples, the known false positives.
2. Add `src/rules/<name>.ts` and put it **at the end** of the catalogue in `src/rules/index.ts`: hosts number the
   rules by their place.
3. If it needs a shape the tree does not name, add the kind to `src/syntax.ts` and fill it in the provider.
4. Test it in `test/rules.test.ts` with a refused and an accepted example, and add a marked line to
   `test/fixtures/violations` (`// expect: <name>`).
5. Regenerate the configuration schema: `pnpm --filter @strict-ts/cli schema`.

When a rule cannot tell, it refuses.
