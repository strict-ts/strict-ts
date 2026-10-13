// A generator that says it gives things to change, and gives what a parameter holds.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function* each(list: readonly Cart[]): Generator<Mut<Cart>> {
  for (const cart of list) yield cart;
}
const carts = [{ total: 3 }];
for (const cart of each(carts)) cart.total = 0;
if (carts[0]?.total !== 3) console.log('BROKEN m58: each takes no Mut and total is', carts[0]?.total);
