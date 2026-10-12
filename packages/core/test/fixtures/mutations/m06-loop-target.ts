// A property of a parameter used as the variable of a loop.
const state = { count: 0 };
function last(given: typeof state): void {
  for (given.count of [1, 2, 3]);
}
last(state);
if (state.count !== 0) console.log('BROKEN m06: last takes no Mut and count is', state.count);
export {};
