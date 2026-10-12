// A map that says Mut of its keys, written through its values.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function wipe(carts: ReadonlyMap<Mut<Cart>, Cart>): void {
  for (const cart of carts.values()) cart.total = 0;
}
const kept = { total: 3 };
wipe(new Map([[{ total: 1 }, kept]]));
if (kept.total !== 3) console.log('BROKEN m48: the values say no Mut and total is', kept.total);
