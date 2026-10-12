// A parameter that does not ask for mutation, put in a list that can be written, and changed through the list.
import type { Mut } from '@strict-ts/std';
const state = { count: 0 };
function keep(given: typeof state): void {
  const all: Mut<(typeof state)[]> = [];
  all.push(given);
  for (const one of all) one.count += 1;
}
keep(state);
if (state.count !== 0) console.log('BROKEN m32: keep takes no Mut and count is', state.count);
