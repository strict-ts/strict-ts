// A Result is iterable (that is what `yield*` uses), and vitest compares iterables by iterating them: two Ok would
// always be equal and an Err would throw. Importing this file makes `toEqual` compare the variant and its payload.
import { expect } from 'vitest';
import { Err, Ok } from '../src/index.js';

expect.addEqualityTesters([
  function (a: unknown, b: unknown): boolean | undefined {
    const isResult = (x: unknown) => x instanceof Ok || x instanceof Err;
    if (!isResult(a) && !isResult(b)) return undefined;
    if (a instanceof Ok && b instanceof Ok) return this.equals(a.value, b.value);
    if (a instanceof Err && b instanceof Err) return this.equals(a.error, b.error);
    return false;
  },
]);
