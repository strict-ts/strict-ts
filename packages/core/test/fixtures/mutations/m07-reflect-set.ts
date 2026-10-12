// A property of a parameter written by a function of the platform.
const state = { count: 0 };
function poke(given: typeof state): void {
  Reflect.set(given, 'count', 7);
}
poke(state);
if (state.count !== 0) console.log('BROKEN m07: poke takes no Mut and count is', state.count);
export {};
