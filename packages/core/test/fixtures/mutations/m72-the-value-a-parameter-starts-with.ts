// A parameter that asks Mut starts with another that does not; so does a name a pattern fills in.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function a(cart: Cart, same: Mut<Cart> = cart): void {
  same.total -= 1;
}
function b(cart: Cart): void {
  const { same = cart }: { readonly same?: Mut<Cart> } = {};
  same.total -= 1;
}
const cart = { total: 3 };
a(cart);
b(cart);
if (cart.total !== 3) console.log('BROKEN m72: neither takes Mut of the cart and total is', cart.total);
