// A parameter that does not ask for mutation, handed back inside an object made in place whose type says Mut.
import type { Mut } from '@strict-ts/std';
const state = { count: 0 };
type Box = { readonly inner: typeof state };
const wrap = (given: typeof state): Mut<Box> => ({ inner: given });
function bump(): void {
  const box = wrap(state);
  box.inner.count += 1;
}
bump();
if (state.count !== 0) console.log('BROKEN m34: wrap takes no Mut and count is', state.count);
