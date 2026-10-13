// `map` and `flatMap` that wrap each thing in something new: the things are the same.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function a(carts: readonly Cart[]): void {
  const first = carts.flatMap((cart) => [cart])[0];
  if (first !== undefined) first.total -= 1;
}
function b(carts: readonly Cart[]): void {
  const first = carts.map((cart) => ({ cart }))[0];
  if (first !== undefined) first.cart.total -= 1;
}
const carts = [{ total: 3 }];
a(carts);
b(carts);
if (carts[0]?.total !== 3) console.log('BROKEN m61: neither takes Mut and total is', carts[0]?.total);
