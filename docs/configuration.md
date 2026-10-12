# Configuration

An optional `strict-ts.json` beside `tsconfig.json`. Every key is optional; an unknown key or rule name is an error.

```json
{
  "$schema": "./node_modules/@strict-ts/cli/strict-ts.schema.json",
  "unsafeDirs": ["src/unsafe"],
  "allowedImports": ["@strict-ts/std"],
  "pureDirs": ["src/domain"],
  "rules": ["no-any", "no-cast"],
  "baseline": "strict-ts-baseline.json"
}
```

| Key | Default | Meaning |
|---|---|---|
| `unsafeDirs` | `["src/unsafe"]` | The unsafe directories, relative to the directory of `tsconfig.json`. A single file may be named too, for the one a tool wants at a fixed place (`next-env.d.ts`); so may one in `testDirs` (`vitest.config.ts`) |
| `allowedImports` | `["@strict-ts/std"]` | The packages safe code may import; their functions are trusted not to throw. `react` covers `@types/react` |
| `pureDirs` | none | The directories whose code must be pure (rule `pure-domain`) |
| `testDirs` | `["test", "tests"]` | The directories that hold tests. A file named `*.test.*` or `*.spec.*`, or under `__tests__`, is a test wherever it is. A test is checked like any code, except that it may throw, call what throws and import what it needs |
| `assume` | none | What the project says of itself and that no rule can check. `attached-buffers`: no buffer is ever detached, so typed arrays and `DataView` do not throw for that. `dom-as-observed`: a function of the DOM that never threw when it was run in a browser is taken not to throw. `generated-receivers`: a method whose arguments are written in the call, and that did not throw on a list of receivers, is taken not to throw |
| `rules` | all | The rules to run |
| `baseline` | `strict-ts-baseline.json` | Where the baseline is read and written |
| `$schema` | none | The JSON schema, for completion and validation in the editor |
