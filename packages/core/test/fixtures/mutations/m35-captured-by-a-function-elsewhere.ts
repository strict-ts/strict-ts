// A parameter kept by a function that is handed back, and changed when someone else calls it.
const state = { count: 0 };
const later = (given: typeof state): (() => void) => {
  const alias = given;
  return () => {
    alias.count += 1;
  };
};
later(state)();
if (state.count !== 0) console.log('BROKEN m35: later takes no Mut and count is', state.count);
export {};
