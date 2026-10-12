# In the editor

In VS Code, and the editors built on it, install the extension the repo builds:

```sh
pnpm build
code --install-extension packages/vscode/dist/strict-ts.vsix
```

Reload the window, and open a project that has a `strict-ts.json` beside its `tsconfig.json` (an empty `{}` is
enough): the same refusals as the gate are underlined as you type. In a project without that file the extension
shows nothing. What the baseline allows is a warning, what goes beyond it an error.

The extension holds no rule: it hands a TypeScript language service plugin to the TypeScript the editor runs, which
must be 6 or earlier. A native TypeScript 7 server has no plugin API. The plugin was tried against a real TypeScript
5.9 server started as the editor starts it; the extension itself has not been opened in an editor yet.

Another editor that runs `tsserver` can name the plugin in `tsconfig.json`, when the workspace has its own
TypeScript 6 with the plugin beside it:

```json
{ "compilerOptions": { "plugins": [{ "name": "@strict-ts/language-service" }] } }
```
