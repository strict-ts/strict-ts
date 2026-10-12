// A property of a parameter written by an assignment through a pattern.
const state = { count: 0 };
function reset(given: typeof state): void {
  [given.count] = [5];
}
reset(state);
if (state.count !== 0) console.log('BROKEN m05: reset takes no Mut and count is', state.count);
export {};
