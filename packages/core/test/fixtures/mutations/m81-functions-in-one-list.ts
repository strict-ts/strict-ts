// Functions that differ only by Mut, in one list: gone through by a method of the library, or given under a quieter type.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
type Quiet = (cart: Cart) => void;
const read = (cart: Cart): void => {
  void cart.total;
};
const less = (cart: Mut<Cart>): void => {
  cart.total -= 1;
};
const runAll = (fs: readonly Quiet[], cart: Cart): void => {
  for (const f of fs) f(cart);
};
function a(cart: Cart): void {
  [read, less].forEach((f) => f(cart));
}
function b(cart: Cart): void {
  const fs = [read, less];
  runAll(fs, cart);
}
const cart = { total: 3 };
a(cart);
b(cart);
if (cart.total !== 3) console.log('BROKEN m81: neither takes Mut and total is', cart.total);
