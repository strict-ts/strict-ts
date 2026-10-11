# @strict-ts/oxlint-plugin

The three rules of strict-ts that need no type, as an [Oxlint](https://oxc.rs) plugin: `no-throw`, `no-null`,
`no-ts-directive`. They refuse the same code, at the same places, as the rules of the same name in the gate; a test
compares the two on whole projects.

```json
{
  "jsPlugins": ["@strict-ts/oxlint-plugin"],
  "rules": {
    "strict-ts/no-throw": ["error", { "unsafeDirs": ["src/unsafe"] }],
    "strict-ts/no-null": ["error", { "unsafeDirs": ["src/unsafe"] }],
    "strict-ts/no-ts-directive": "error"
  }
}
```

`unsafeDirs` is relative to where Oxlint runs, and defaults to `src/unsafe` as in `strict-ts.json`.

## What it is for, and what it is not

Measured on a generated project of 124,000 lines: Oxlint gives these three rules in 0.4 s, where the whole gate takes
about 9 s. So it is a quick first answer, in an editor or before a commit.

It does **not** make the gate faster. The same measure shows that the gate spends its time compiling: about 8 s with
no rule at all, about 9 s with the seventeen, and the three syntactic ones are within the noise. The gate keeps them,
and stays the check that counts: Oxlint sees neither types nor the compiler's errors.

## To know

- It needs an Oxlint that loads JavaScript plugins (`jsPlugins`); tested with 1.87.
- A report carries the rule's help in its message, since a plugin has one text per report.
