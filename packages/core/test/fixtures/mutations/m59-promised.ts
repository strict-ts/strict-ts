// A promise made in place holds what its function gives to `resolve`.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
async function wipe(cart: Cart): Promise<void> {
  const same = await new Promise<Mut<Cart>>((resolve) => {
    resolve(cart);
  });
  same.total = 0;
}
const cart = { total: 3 };
void wipe(cart).then(() => {
  if (cart.total !== 3) console.log('BROKEN m59: wipe takes no Mut and total is', cart.total);
});
