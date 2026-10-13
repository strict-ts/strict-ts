// A function that does not say it hands out something to change, under a type of function that does.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
const held: Cart = { total: 3 };
const plain = (): Cart => held;
class Quiet {
  open(): Cart {
    return held;
  }
}
type Opens = { readonly open: () => Mut<Cart> };
function a(): void {
  const get: () => Mut<Cart> = plain;
  get().total -= 1;
}
function b(): void {
  const shop: Opens = new Quiet();
  shop.open().total -= 1;
}
a();
b();
if (held.total !== 3) console.log('BROKEN m67: nothing said Mut of what was held and total is', held.total);
