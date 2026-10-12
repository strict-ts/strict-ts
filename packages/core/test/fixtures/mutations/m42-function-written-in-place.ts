// A function that asks for Mut, written in place where one that does not is asked for.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
type Visitor = { readonly visit: (cart: Cart) => void };
const zero: Visitor = {
  visit: (cart: Mut<Cart>) => {
    cart.total = 0;
  },
};
function walk(cart: Cart, visitor: Visitor): void {
  visitor.visit(cart);
}
const cart = { total: 3 };
walk(cart, zero);
if (cart.total !== 3) console.log('BROKEN m42: walk takes no Mut and total is', cart.total);
