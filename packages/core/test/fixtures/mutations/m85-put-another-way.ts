// A value put in a place that says Mut another way than by `=` or `push(x)`.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
type Slot = { c: Mut<Cart | undefined> };
function a(cart: Cart): void {
  const list: Mut<Mut<Cart>[]> = [];
  Array.prototype.push.call(list, cart);
  const first = list[0];
  if (first !== undefined) first.total -= 1;
}
function b(carts: readonly Cart[]): void {
  const list: Mut<Mut<Cart>[]> = [];
  list.push(...carts);
  for (const cart of list) cart.total -= 1;
}
function c(cart: Cart): void {
  const slot: Mut<Slot> = { c: undefined };
  [slot.c] = [cart];
  if (slot.c !== undefined) slot.c.total -= 1;
}
function d(cart: Cart): void {
  const slot: Mut<Slot> = { c: undefined };
  slot.c ??= cart;
  slot.c.total -= 1;
}
function e(cart: Cart): void {
  const slot: Mut<Slot> = { c: undefined };
  for (slot.c of [cart]) void slot;
  if (slot.c !== undefined) slot.c.total -= 1;
}
const cart = { total: 5 };
a(cart);
b([cart]);
c(cart);
d(cart);
e(cart);
if (cart.total !== 5) console.log('BROKEN m85: none of them takes Mut and total is', cart.total);
