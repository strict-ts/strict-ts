// A tag that asks Mut of a value of its template.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function tag(_texts: TemplateStringsArray, cart: Mut<Cart>): number {
  cart.total = 0;
  return 0;
}
function wipe(cart: Cart): number {
  return tag`${cart}`;
}
const cart = { total: 3 };
wipe(cart);
if (cart.total !== 3) console.log('BROKEN m60: wipe takes no Mut and total is', cart.total);
