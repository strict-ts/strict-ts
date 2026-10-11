# @strict-ts/probe

Runs a project's tests on instrumented code, and reports what contradicts what the gate took on trust. It is to
strict-ts what a sanitizer is to a compiler: the gate proves, the probes look.

## What is probed

| Where | What the probe does | What it reports |
|---|---|---|
| A call to code declared outside the project | Catches what the call throws, and throws it again | A function the effects ledger calls safe that threw; one that is not in the ledger and threw |
| A function exported by an unsafe directory | Catches what leaves it, and throws it again | An exception that crossed the boundary |
| A cast (`x as T`, `<T>x`) | Compares the value with the shape of `T` (primitives, literals, arrays, properties, unions) | A cast that was not true, with the path of the first difference |
| A variable written with a read-only type and a value | Freezes the value, in depth, when it is plain data | Nothing: changing it throws in the test |

A probe hands back the value it was given and throws again what it caught: instrumented code behaves as the code it
was made from. The receiver and the arguments of a call are computed before the probe, so what it catches is the
call's own.

## Using it

Load the plugin in Vite or Vitest (`strictTsProbe()` from `@strict-ts/probe/vite`): each TypeScript file of a project
is replaced by its instrumented JavaScript, with its source map. Run the tests; then `strict-ts-probe report` reads
`.strict-ts-probe/events.jsonl`. Exit code 1 when something contradicts, 2 when there is nothing to read.

An instrumented module carries the probes' runtime in its own text: nothing has to be installed where it runs.

## Limits

- **It sees what the tests run, and nothing else.** A function that did not throw in the tests may throw elsewhere.
- A function of a package that throws is not reported: the gate already assumes it may.
- Left alone: a call in an optional chain, `super(…)`, a private method, `eval`.
- A rejected promise is recorded through a handler the probe adds: a rejection nobody handled is no longer reported by
  Node as unhandled.
- Only what is frozen where it is declared is frozen: a value that becomes read-only by being passed is not.
- The probes' runtime is low-level code, recorded in this package's baseline rather than conforming.
