// The object is one of two that differ only by Mut, and a field of it is written, or given where Mut is asked.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
type Closed = { readonly cart: Cart };
type Open = { readonly cart: Mut<Cart> };
const less = (cart: Mut<Cart>): void => {
  cart.total -= 1;
};
function a(closed: Mut<Closed>, open: Mut<Open>, flag: boolean): void {
  (flag ? open : closed).cart.total -= 1;
}
function b(closed: Mut<Closed>, open: Mut<Open>, flag: boolean): void {
  less((flag ? open : closed).cart);
}
const cart = { total: 3 };
a({ cart }, { cart: { total: 0 } }, false);
b({ cart }, { cart: { total: 0 } }, false);
if (cart.total !== 3) console.log('BROKEN m80: the cart says no Mut and total is', cart.total);
