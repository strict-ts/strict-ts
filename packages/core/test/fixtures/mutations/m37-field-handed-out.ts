// A method that does not say `this: Mut<…>` hands out a field of its object as something to change.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
class Shop {
  private readonly cart: Mut<Cart>;
  constructor(cart: Mut<Cart>) {
    this.cart = cart;
  }
  open(): Mut<Cart> {
    return this.cart;
  }
}
function visit(shop: Shop): void {
  shop.open().total = 0;
}
const cart = { total: 3 };
visit(new Shop(cart));
if (cart.total !== 3) console.log('BROKEN m37: visit takes no Mut and total is', cart.total);
