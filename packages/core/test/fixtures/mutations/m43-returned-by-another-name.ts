// A parameter returned as something to change, under another name.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function open(cart: Cart): Mut<Cart> {
  const same = cart;
  return same;
}
const cart = { total: 3 };
open(cart).total = 0;
if (cart.total !== 3) console.log('BROKEN m43: open takes no Mut and total is', cart.total);
