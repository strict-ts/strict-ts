// A parameter that does not ask for mutation, changed through what a function gave back when it was given it.
const state = { count: 0 };
const same = <T>(value: T): T => value;
function bump(given: typeof state): void {
  const alias = same(given);
  alias.count += 1;
}
bump(state);
if (state.count !== 0) console.log('BROKEN m24: bump takes no Mut and count is', state.count);
export {};
