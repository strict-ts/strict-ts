# strict-ts

What strict-ts refuses, underlined as you type, with the rule, its message and how to fix it.

It speaks in a project that has a `strict-ts.json` beside its `tsconfig.json`, and stays silent everywhere else. What
the baseline of the project allows is shown as a warning, what goes beyond it as an error.

It holds no rule: it hands the strict-ts language service plugin to the TypeScript the editor already runs.
