// A new list of the same things, given where Mut is asked of what the list holds.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function zeroAll(list: readonly Mut<Cart>[]): void {
  for (const cart of list) cart.total = 0;
}
function wipe(carts: readonly Cart[]): void {
  zeroAll([...carts]);
}
const carts = [{ total: 3 }];
wipe(carts);
if (carts[0]?.total !== 3) console.log('BROKEN m45: wipe takes no Mut and total is', carts[0]?.total);
