// A function of the library hands back what it was given.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function wipe(cart: Cart): void {
  const [same] = Array.of(cart);
  if (same !== undefined) same.total = 0;
}
const cart = { total: 3 };
wipe(cart);
if (cart.total !== 3) console.log('BROKEN m47: wipe takes no Mut and total is', cart.total);
