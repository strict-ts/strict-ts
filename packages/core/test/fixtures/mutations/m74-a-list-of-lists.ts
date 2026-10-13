// A list of lists that says Mut of the lists, and not of what they hold.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
function a(grid: Mut<Mut<Cart[]>[]>): void {
  const cell = grid[0]?.[0];
  if (cell !== undefined) cell.total -= 1;
}
function b(grid: Mut<Mut<Cart[]>[]>): void {
  for (const row of grid) for (const cell of row) cell.total -= 1;
}
const cart = { total: 3 };
a([[cart]]);
b([[cart]]);
if (cart.total !== 3) console.log('BROKEN m74: the carts say no Mut and total is', cart.total);
