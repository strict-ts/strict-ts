// The object that is written is chosen, awaited, or seen through something.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function a(x: Cart, y: Cart, flag: boolean): void {
  (flag ? x : y).total -= 1;
}
function b(x: Cart | undefined, y: Cart): void {
  (x ?? y).total -= 1;
}
function c(x: Cart): void {
  (x satisfies Cart).total -= 1;
}
async function d(p: Promise<Cart>): Promise<void> {
  (await p).total -= 1;
}
const cart = { total: 4 };
a(cart, cart, true);
b(undefined, cart);
c(cart);
void d(Promise.resolve(cart)).then(() => {
  if (cart.total !== 4) console.log('BROKEN m63: none of them takes Mut and total is', cart.total);
});
