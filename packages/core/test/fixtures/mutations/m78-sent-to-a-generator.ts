// A generator that changes what it is sent by `next`.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function* sink(): Generator<undefined, undefined, Mut<Cart>> {
  const cart = yield undefined;
  cart.total = 0;
  return undefined;
}
function wipe(cart: Cart): void {
  const taker = sink();
  try {
    taker.next(cart);
    taker.next(cart);
  } catch {
    // Nothing to do.
  }
}
const cart = { total: 3 };
wipe(cart);
if (cart.total !== 3) console.log('BROKEN m78: wipe takes no Mut and total is', cart.total);
