// A field with no written type, made in place around something the object was given to read.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
class View {
  private readonly cart: Cart;
  readonly view;
  constructor(cart: Cart) {
    this.cart = cart;
    this.view = { cart: this.cart };
  }
  zero(this: Mut<View>): void {
    this.view.cart.total = 0;
  }
}
class Kept {
  readonly cart: Cart;
  readonly box = { inner: { n: 1 } };
  constructor(cart: Cart) {
    this.cart = cart;
  }
}
const cart = { total: 3 };
new View(cart).zero();
if (cart.total !== 3) console.log('BROKEN m69: the cart was given to read and total is', cart.total, new Kept(cart).box.inner.n);
