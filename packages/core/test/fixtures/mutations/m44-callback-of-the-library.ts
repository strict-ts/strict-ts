// A function that says Mut, given to a method of the library that calls it with what a parameter holds.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function wipe(carts: readonly Cart[]): void {
  carts.forEach((cart: Mut<Cart>) => {
    cart.total = 0;
  });
}
const carts = [{ total: 3 }];
wipe(carts);
if (carts[0]?.total !== 3) console.log('BROKEN m44: wipe takes no Mut and total is', carts[0]?.total);
