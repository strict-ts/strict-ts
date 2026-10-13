// A function that asks Mut, in a map or a promise typed with one that does not.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
type Quiet = (cart: Cart) => void;
function less(cart: Mut<Cart>): void {
  cart.total -= 1;
}
function a(cart: Cart): void {
  const map: ReadonlyMap<string, Quiet> = new Map([['a', less]]);
  map.get('a')?.(cart);
}
async function b(cart: Cart): Promise<void> {
  const kept: Promise<Quiet> = Promise.resolve(less);
  (await kept)(cart);
}
const cart = { total: 3 };
a(cart);
void b(cart).then(() => {
  if (cart.total !== 3) console.log('BROKEN m71: neither takes Mut and total is', cart.total);
});
