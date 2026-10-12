// A function called on a value typed read-only, which it changes through `this`.
import type { Mut } from '@strict-ts/std';
function reset(this: Mut<{ count: number }>): void {
  this.count = 6;
}
const frozen: { readonly count: number; readonly reset: typeof reset } = { count: 0, reset };
frozen.reset();
if (frozen.count !== 0) console.log('BROKEN m16: count is typed readonly and is', frozen.count);
