// A function that says `this: Mut<…>`, given its receiver by `call`.
import type { Mut } from '@strict-ts/std';
const state = { count: 0 };
function reset(this: Mut<typeof state>): void {
  this.count = 5;
}
function touch(given: typeof state): void {
  reset.call(given);
}
touch(state);
if (state.count !== 0) console.log('BROKEN m33: touch takes no Mut and count is', state.count);
