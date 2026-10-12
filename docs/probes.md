# Checking what strict-ts took on trust: the probes

The gate proves what it can and trusts the rest: that a function the effects ledger calls safe does not throw, that
what an unsafe directory exports catches everything, that a cast with its `// SAFETY:` reason is true. `@strict-ts/probe`
checks those at run time. It rewrites the code as it is compiled, puts a probe at each of those places, and the tests
run on that code.

```ts
// vitest.config.ts
import { strictTsProbe } from '@strict-ts/probe/vite';

const probes = strictTsProbe();
export default defineConfig({ plugins: probes.ok ? [probes.value] : [] });
```

```
$ strict-ts-probe report
The ledger says these do not throw, and they threw:
  src/pricing.ts:8:61 `ReadonlyArray.join` threw TypeError: Cannot convert a Symbol value to a string
An exception left an unsafe directory:
  src/unsafe/api.ts:7:14 `parseUser` let through SyntaxError: Expected property name or '}' in JSON
A cast was not true:
  src/unsafe/api.ts:9:16 as User: .id: string expected, number found

3 contradictions; 6 library functions ran 7 times without throwing
```

A value declared read-only where it is made is also frozen, so that changing it through any name throws in the test.
It only sees what the tests run: it finds what is wrong, it does not prove that nothing is. `pnpm probe` runs it on
this repo.
