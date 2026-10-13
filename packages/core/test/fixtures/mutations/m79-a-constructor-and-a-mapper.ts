// A constructor given a list spread; a list made by a library function out of what a function of ours hands back.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
class Holder {
  readonly cart: Mut<Cart>;
  constructor(cart: Mut<Cart>) {
    this.cart = cart;
  }
}
function a(cart: Cart): void {
  const args: readonly [Cart] = [cart];
  new Holder(...args).cart.total -= 1;
}
function b(cart: Cart): void {
  const made = [1].map(() => cart);
  const first = made[0];
  if (first !== undefined) first.total -= 1;
}
const cart = { total: 3 };
a(cart);
b(cart);
if (cart.total !== 3) console.log('BROKEN m79: neither takes Mut and total is', cart.total);
