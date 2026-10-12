// A parameter put in an object by its name alone.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function wipe(cart: Cart): void {
  const box = { cart };
  box.cart.total = 0;
}
const cart = { total: 3 };
wipe(cart);
if (cart.total !== 3) console.log('BROKEN m54: wipe takes no Mut and total is', cart.total);
