// A function that takes or gives back a function, under a type that says something else of that function.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
type Quiet = (cart: Cart) => void;
function less(cart: Mut<Cart>): void {
  cart.total -= 1;
}
const callQuiet = (f: Quiet, cart: Cart): void => f(cart);
const makeLoud = (): ((cart: Mut<Cart>) => void) => less;
function a(cart: Cart): void {
  const run: (f: (cart: Mut<Cart>) => void, cart: Cart) => void = callQuiet;
  run(less, cart);
}
function b(cart: Cart): void {
  const make: () => Quiet = makeLoud;
  make()(cart);
}
const cart = { total: 3 };
a(cart);
b(cart);
if (cart.total !== 3) console.log('BROKEN m70: neither takes Mut and total is', cart.total);
