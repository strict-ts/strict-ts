// A function that asks for Mut, given where a function that does not is asked for.
import type { Mut } from '@strict-ts/std';
const frozen: { readonly count: number } = { count: 0 };
const through = (run: (given: { readonly count: number }) => void): void => run(frozen);
const write = (given: Mut<{ count: number }>): void => {
  given.count = 9;
};
through(write);
if (frozen.count !== 0) console.log('BROKEN m14: count is typed readonly and is', frozen.count);
