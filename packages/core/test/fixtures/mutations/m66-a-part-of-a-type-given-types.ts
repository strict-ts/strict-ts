// A parameter of a type that is given types, one of which says Mut: a part taken out of it by a pattern.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
interface Pair<X, Y> {
  readonly first: X;
  readonly second: Y;
}
function wipe(pair: Pair<Cart, Mut<Cart>>): void {
  const { first } = pair;
  first.total = 0;
}
const kept = { total: 3 };
wipe({ first: kept, second: { total: 1 } });
if (kept.total !== 3) console.log('BROKEN m66: the first says no Mut and total is', kept.total);
