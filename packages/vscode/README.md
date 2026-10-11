# @strict-ts/vscode

strict-ts in VS Code, and in the editors built on it. An extension with no code of its own: it hands the
[language service plugin](../language-service) to the TypeScript the editor already runs.

```sh
pnpm build                                                   # writes packages/vscode/dist/
code --install-extension packages/vscode/dist/strict-ts.vsix
```

Or, in the editor: « Extensions: Install from VSIX… », then « Developer: Reload Window ».

Then open a project that has a `strict-ts.json` beside its `tsconfig.json`: what the gate refuses is underlined, with
the rule, its message and how to fix it. Try `examples/report/classic/report.ts` in this repo.

## To know

- **It speaks only where a project asked for it**: one with a `strict-ts.json`, even an empty `{}`. In any other
  project it shows nothing.
- What the baseline allows is a warning, what goes beyond it an error.
- The editor must run TypeScript 6 or earlier, its own or the workspace's. The native TypeScript 7 server has no
  plugin API: with the « TypeScript (Native Preview) » extension enabled, nothing is shown.
- After `pnpm build` gives a new plugin, install the VSIX again and reload the window.
- Why an extension, and not a line in `tsconfig.json`: the TypeScript server looks for a plugin named in
  `tsconfig.json` beside its own files, so that only works when the workspace has its own TypeScript 6 and the editor
  is told to use it. An extension is found whatever TypeScript runs.

## How it was tried

Against a real TypeScript 5.9 server, started the way the editor starts it for an extension (`--globalPlugins`,
`--pluginProbeLocations`): 7 refusals on `examples/transfer/classic`, none on the conforming one, none in a project
without `strict-ts.json`. **It has not been opened in VS Code itself**: the manifest and the VSIX are written by hand
from their formats, and only an editor can say they are right.
