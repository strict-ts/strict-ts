// The keys of a map, and what its iterator gives, are what the map holds.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function a(carts: ReadonlyMap<Cart, number>): void {
  for (const cart of carts.keys()) cart.total -= 1;
}
function b(carts: readonly Cart[]): void {
  const next = carts[Symbol.iterator]().next();
  if (next.done !== true) next.value.total -= 1;
}
const cart = { total: 3 };
a(new Map([[cart, 1]]));
b([cart]);
if (cart.total !== 3) console.log('BROKEN m62: neither takes Mut and total is', cart.total);
