// A parameter that does not ask for mutation, changed through a local name for it.
const state = { count: 0 };
function bump(given: typeof state): void {
  const alias = given;
  alias.count += 1;
}
bump(state);
if (state.count !== 0) console.log('BROKEN m01: bump takes no Mut and count is', state.count);
export {};
