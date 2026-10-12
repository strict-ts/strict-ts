// A parameter put in an object the function made, by a function of the platform.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function wipe(cart: Cart): void {
  const holder = { cart: { total: 1 } };
  try {
    Object.assign(holder, { cart: cart });
  } catch {
    return;
  }
  holder.cart.total = 0;
}
const cart = { total: 3 };
wipe(cart);
if (cart.total !== 3) console.log('BROKEN m57: wipe takes no Mut and total is', cart.total);
