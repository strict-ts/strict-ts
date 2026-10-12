# The command line

```
strict-ts [options]

  -p, --project <path>   A tsconfig.json, or a directory that holds one (default: the current directory)
      --format <format>  text (default), json or sarif
      --output <file>    Write the report to a file instead of the standard output
      --update-baseline  Record the violations found in the baseline file, and exit with 0
      --no-baseline      Ignore the baseline file: refuse every violation
      --strict-baseline  Fail when the baseline allows more than what is found
      --cache            Check only the files that changed since the last run, or that import one that did
      --timing           Say how many files were checked, and in how long
  -h, --help             Show this help
```

| Exit code | Meaning |
|---|---|
| 0 | Nothing is refused |
| 1 | Something is refused |
| 2 | The project could not be checked: wrong arguments, unreadable `tsconfig.json`, `strict-ts.json` or baseline, no file |

A project that cannot be checked is never reported as safe.

The text output gives one line per refusal, `file:line:column rule message`, and a `help:` line below. `--format json`
prints one document, `{ "diagnostics": [...] }`. `--format sarif` prints a SARIF 2.1.0 log for code-scanning views.

`--cache` keeps the result of each file in `node_modules/.cache/strict-ts/cache.json` and checks again only the files
whose text changed, or that import, directly or not, a file that did. A change of configuration, of compiler options,
of a dependency or of a file that declares globals spares nothing. On a generated project of 124,000 lines in 1,000
files, a run takes 11 to 17 s without it and 3 s with it when nothing or one leaf file changed.

One run checks one `tsconfig.json`: project references are not followed, so a monorepo runs the gate once per package
(see `pnpm check` in [`package.json`](../package.json)).
