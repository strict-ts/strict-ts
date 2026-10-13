// A function that says `this: Mut<…>`, given its object as the argument a method of the library takes after it.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function zeroThis(this: Mut<Cart>): void {
  this.total = 0;
}
function wipe(cart: Cart): void {
  [1].forEach(zeroThis, cart);
}
const cart = { total: 3 };
wipe(cart);
if (cart.total !== 3) console.log('BROKEN m83: wipe takes no Mut and total is', cart.total);
