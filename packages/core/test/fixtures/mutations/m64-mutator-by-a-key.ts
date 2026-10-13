// A method that changes its object, reached by a key.
import type { Mut } from '@strict-ts/std';
type Cart = { readonly items: Mut<string[]> };
function add(cart: Cart): void {
  cart['items']['push']('x');
}
const cart: Cart = { items: [] };
add(cart);
if (cart.items.length !== 0) console.log('BROKEN m64: add takes no Mut and the cart holds', cart.items.length);
