// A method that changes its object, called with `call` on what was given.
import type { Mut } from '@strict-ts/std';
type Cart = { readonly items: Mut<string[]> };
function add(cart: Cart): void {
  Array.prototype.push.call(cart.items, 'x');
}
const cart: Cart = { items: [] };
add(cart);
if (cart.items.length !== 0) console.log('BROKEN m40: add takes no Mut and the cart holds', cart.items.length);
