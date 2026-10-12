// A parameter kept by a function that changes it later, when nobody is looking.
const state = { count: 0 };
function later(given: typeof state): () => void {
  return () => {
    given.count += 1;
  };
}
later(state)();
if (state.count !== 0) console.log('BROKEN m17: later takes no Mut and count is', state.count);
export {};
