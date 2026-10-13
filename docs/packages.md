# Packages

| Package | Role | State |
|---|---|---|
| [`@strict-ts/core`](../packages/core) | The rule engine, with no dependency on Node or on a TypeScript version | 40 rules, TypeScript 6 provider |
| [`@strict-ts/cli`](../packages/cli) | The CI gate | text, JSON and SARIF output, `strict-ts.json`, baseline, incremental cache |
| [`@strict-ts/std`](../packages/std) | The runtime library of conforming code | `Result`, `Option`, schemas, `panic`, `Mut`, `Once` |
| [`@strict-ts/wrap`](../packages/wrap) | Generates the `unsafe/` wrapper of a dependency | functions and constants; classes and objects left out |
| [`@strict-ts/derive`](../packages/derive) | Generates the schema of a type from the type: nobody writes a schema | a spike: objects, arrays, literals, choices, records, dates, brands; one file at a time |
| [`@strict-ts/language-service`](../packages/language-service) | The refusals in the editor | plugin tried against a real TypeScript server |
| [`@strict-ts/vscode`](../packages/vscode) | The VS Code extension that carries the plugin; not published | builds a VSIX; not opened in an editor yet |
| [`@strict-ts/oxlint-plugin`](../packages/oxlint-plugin) | `no-throw`, `no-null` and `no-ts-directive` as an Oxlint plugin: a quick first answer, not a faster gate | same diagnostics as the gate, compared in a test |
| [`@strict-ts/probe`](../packages/probe) | Runs the tests on instrumented code and reports what contradicts what the gate took on trust | calls, unsafe boundaries, casts, frozen read-only values |
| [`@strict-ts/playground`](../packages/playground) | strict-ts in the browser, on eleven scenarios; not published | the engine and the page, which the website shows as one of its pages |
| [`@strict-ts/site`](../packages/site) | The website: a front page, these documents as pages, the playground; not published | a folder of files, served by nginx from the `Dockerfile` at the root |
| [`@strict-ts/ledger`](../packages/ledger) | Builds the effects ledger: runs the standard library and reads the specification; a tool of this repo | 802 of 844 functions of ECMAScript run, 797 entries; 1,464 functions of the DOM run in a browser |
| [`@strict-ts/codemod`](../packages/codemod) | Automatic fixes and migration of existing code | `readonly-types` and `no-type-predicate`, each fix kept only if the project still compiles; `no-null` on request, where the `null` stays in the program |
| `@strict-ts/flow` | Flow analysis across `await` and aliases. The single-use rule does not need it: it follows each function on the syntax tree of `core` | not started |
