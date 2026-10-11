# @strict-ts/language-service

The strict-ts gate in the editor: a TypeScript language service plugin that adds what the rules refuse to a file's
diagnostics, with the same engine, messages and helps as the command line.

```json
{ "compilerOptions": { "plugins": [{ "name": "@strict-ts/language-service" }] } }
```

- It reads `strict-ts.json` and the baseline beside `tsconfig.json`. What the baseline allows is a warning, what goes
  beyond it an error.
- A configuration that cannot be read is said on the file: it is not shown as conforming.
- The plugin is one CommonJS file, as the TypeScript server requires; the compiler is the editor's own.

## To know

- The editor must use the workspace's TypeScript, 6 or earlier. A native TypeScript 7 server has no plugin API.
- A plugin named in `tsconfig.json` is looked for beside the TypeScript server's own files, not beside the project:
  it is found only when the workspace has its own TypeScript 6 and the editor uses it. [`@strict-ts/vscode`](../vscode)
  is the way that works whatever TypeScript runs.
- Loaded for every project by an editor extension, it only speaks in a project that has a `strict-ts.json`.
- It is tested against the language service API, and was tried against a real TypeScript 5.9 server. It has not been
  opened in an editor yet.
- Each request checks the file again: there is no cache.
