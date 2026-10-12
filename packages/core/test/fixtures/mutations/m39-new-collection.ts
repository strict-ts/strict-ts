// A new map of the same things is not a copy of them.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function wipe(carts: ReadonlyMap<string, Cart>): void {
  for (const cart of new Map(carts).values()) cart.total = 0;
}
const carts = new Map([['a', { total: 3 }]]);
wipe(carts);
if (carts.get('a')?.total !== 3) console.log('BROKEN m39: wipe takes no Mut and total is', carts.get('a')?.total);
