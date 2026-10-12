// A variable that is first something of its own, then a name for a parameter.
const state = { count: 0 };
function bump(given: typeof state): void {
  let work = { count: 0 };
  work = given;
  work.count += 1;
}
bump(state);
if (state.count !== 0) console.log('BROKEN m21: bump takes no Mut and count is', state.count);
export {};
