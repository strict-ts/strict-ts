// An arrow written where a function that hands out something to change is asked, and that hands out a parameter.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function wipe(cart: Cart): void {
  const get: () => Mut<Cart> = () => cart;
  get().total = 0;
}
const cart = { total: 3 };
wipe(cart);
if (cart.total !== 3) console.log('BROKEN m68: wipe takes no Mut and total is', cart.total);
