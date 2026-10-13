// A list of lists that says Mut of the lists only: in a field, given back by a function; and a table read by a pattern.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
class Grid {
  rows: Mut<Mut<Cart[]>[]>;
  constructor(rows: Mut<Mut<Cart[]>[]>) {
    this.rows = rows;
  }
  less(this: Mut<Grid>): void {
    for (const row of this.rows) for (const cell of row) cell.total -= 1;
  }
}
const rowsOf = (carts: readonly Cart[]): Mut<Mut<Cart[]>[]> => [[...carts]];
function a(carts: readonly Cart[]): void {
  for (const row of rowsOf(carts)) for (const cell of row) cell.total -= 1;
}
function b(carts: Mut<Record<string, Cart>>): void {
  const { first } = carts;
  if (first !== undefined) first.total -= 1;
}
const cart = { total: 3 };
new Grid([[cart]]).less();
a([cart]);
b({ first: cart });
if (cart.total !== 3) console.log('BROKEN m75: the carts say no Mut and total is', cart.total);
