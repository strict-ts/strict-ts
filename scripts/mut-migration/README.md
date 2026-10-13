# Moving code to the Mut the compiler carries

Scratch tools of the branch `mut-carried` (task STS-144, Plane page « RFC · a Mut the compiler carries »). Not part
of any package; they are what the fixer has to become.

- `mutfix.mjs <typescript.js> <tsconfig>`: wraps in `mut(…)` what is made in place (an array, an object, `new`, a
  copy) where the compiler asks for `Mut<…>`, and says what it left: those are given, not made, and are for a person.
- `mutlocals.py <project> <cli main.js>`: wraps the value a local starts with, where the gate says the local is
  changed and its type does not say `Mut<…>`.
- `mutimports.py <dir> [<file that exports mut>]`: adds the import of `mut` where it is called.
- `port-fixtures.sh <dir>`: ports a directory of single-file fixtures (drops `Mut<number>` on fields, then the two above).
