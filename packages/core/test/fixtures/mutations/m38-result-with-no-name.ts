// What a method of a list hands out, written with no name for it.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function first(carts: readonly Cart[]): void {
  const one = carts.slice()[0];
  if (one !== undefined) one.total = 0;
}
function found(carts: readonly Cart[]): void {
  for (const cart of new Map(carts.map((cart) => [cart.total, cart] as const)).values()) cart.total = -1;
}
const carts = [{ total: 3 }];
first(carts);
if (carts[0]?.total !== 3) console.log('BROKEN m38: first takes no Mut and total is', carts[0]?.total);
found(carts);
