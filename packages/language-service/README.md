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
- It is tested against the language service API on real projects, and has not been tried in an editor yet.
- Each request checks the file again: there is no cache.
