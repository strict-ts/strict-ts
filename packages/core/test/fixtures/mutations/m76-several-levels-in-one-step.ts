// More than one level of lists gone into in one step, where only the outer one says Mut.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
type Grid = Mut<Mut<Cart[]>[]>;
function a(grid: Grid): void {
  for (const cell of grid.flat()) cell.total -= 1;
}
function b(grid: Grid): void {
  const cell = grid.at(0)?.at(0);
  if (cell !== undefined) cell.total -= 1;
}
function c(grid: Grid): void {
  const [[cell]] = grid;
  if (cell !== undefined) cell.total -= 1;
}
function d(grid: Grid): void {
  for (const [cell] of grid) if (cell !== undefined) cell.total -= 1;
}
function e(byName: Mut<Map<string, Mut<Map<string, Cart>>>>): void {
  const cart = byName.get('a')?.get('b');
  if (cart !== undefined) cart.total -= 1;
}
function f(list: Mut<Cart[]>): void {
  const first = list.map((cart) => cart)[0];
  if (first !== undefined) first.total -= 1;
}
const cart = { total: 3 };
a([[cart]]);
b([[cart]]);
c([[cart]]);
d([[cart]]);
e(new Map([['a', new Map([['b', cart]])]]));
f([cart]);
if (cart.total !== 3) console.log('BROKEN m76: the carts say no Mut and total is', cart.total);
