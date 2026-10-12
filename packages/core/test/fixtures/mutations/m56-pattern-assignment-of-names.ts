// Names given, by a pattern, what a list of parameters holds.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function wipe(first: Cart, second: Cart): void {
  let x = { total: 1 };
  let y = { total: 2 };
  [x, y] = [first, second];
  x.total = 0;
  y.total = 0;
}
const one = { total: 3 };
const two = { total: 4 };
wipe(one, two);
if (one.total !== 3 || two.total !== 4) console.log('BROKEN m56: wipe takes no Mut and totals are', one.total, two.total);
