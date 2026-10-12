// A function that asks Mut of its parameter, given it by `call`, `apply`, `bind`, or a list spread.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function zero(cart: Mut<Cart>): void {
  cart.total -= 1;
}
function a(cart: Cart): void {
  zero.call(undefined, cart);
}
function b(cart: Cart): void {
  zero.apply(undefined, [cart]);
}
function c(cart: Cart): void {
  zero.bind(undefined, cart)();
}
function d(cart: Cart): void {
  const list: readonly [Cart] = [cart];
  zero(...list);
}
const cart = { total: 4 };
a(cart);
b(cart);
c(cart);
d(cart);
if (cart.total !== 4) console.log('BROKEN m52: none of them takes Mut and total is', cart.total);
