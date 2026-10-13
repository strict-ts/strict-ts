// Two functions that differ only by Mut are one type for the compiler: one of them is called, chosen as it runs.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
const read = (cart: Cart): void => {
  void cart.total;
};
const less = (cart: Mut<Cart>): void => {
  cart.total -= 1;
};
const pick = (flag: boolean) => (flag ? read : less);
function a(cart: Cart, flag: boolean): void {
  const f = flag ? read : less;
  f(cart);
}
function b(cart: Cart): void {
  for (const f of [read, less]) f(cart);
}
function c(cart: Cart): void {
  pick(false)(cart);
}
function d(cart: Cart): void {
  const byName = new Map([['a', read], ['b', less]]);
  byName.get('b')?.(cart);
}
const cart = { total: 4 };
a(cart, false);
b(cart);
c(cart);
d(cart);
if (cart.total !== 4) console.log('BROKEN m77: none of them takes Mut and total is', cart.total);
