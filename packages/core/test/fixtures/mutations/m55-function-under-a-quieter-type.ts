// A function that asks Mut of its parameter, kept under a type of function that does not, then called.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
type Quiet = (cart: Cart) => void;
function less(cart: Mut<Cart>): void {
  cart.total -= 1;
}
function a(cart: Cart): void {
  const map = new Map<string, Quiet>();
  map.set('a', less);
  map.get('a')?.(cart);
}
function b(cart: Cart): void {
  const kept: { run: Mut<Quiet | undefined> } = { run: undefined };
  kept.run = less;
  kept.run(cart);
}
function c(cart: Cart): void {
  const list: readonly Quiet[] = [less].concat();
  list[0]?.(cart);
}
const cart = { total: 3 };
a(cart);
b(cart);
c(cart);
if (cart.total !== 3) console.log('BROKEN m55: none of them takes Mut and total is', cart.total);
