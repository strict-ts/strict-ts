// A parameter that does not ask for mutation, kept in a field, and changed later through the field.
import type { Mut } from '@strict-ts/std';
class State {
  count: Mut<number> = 0;
}
class Holder {
  constructor(private readonly kept: State) {}
  bump(this: Mut<Holder>): void {
    this.kept.count += 1;
  }
}
const state = new State();
const holder: Mut<Holder> = new Holder(state);
holder.bump();
if (state.count !== 0) console.log('BROKEN m31: the constructor takes no Mut and count is', state.count);
