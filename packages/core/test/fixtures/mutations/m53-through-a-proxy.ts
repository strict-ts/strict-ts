// A proxy is its target, seen through.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function wipe(cart: Cart): void {
  const seen = new Proxy(cart, {});
  seen.total = 0;
}
const cart = { total: 3 };
wipe(cart);
if (cart.total !== 3) console.log('BROKEN m53: wipe takes no Mut and total is', cart.total);
