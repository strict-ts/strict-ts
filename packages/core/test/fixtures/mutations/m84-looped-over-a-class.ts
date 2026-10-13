// What a class of the project goes through when it is looped over: its iterator hands out what it was given to read.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
class Bag {
  private readonly items: readonly Cart[];
  constructor(items: readonly Cart[]) {
    this.items = items;
  }
  [Symbol.iterator](): IterableIterator<Cart> {
    return this.items.values();
  }
}
function a(carts: readonly Cart[]): void {
  for (const cart of new Bag(carts)) cart.total -= 1;
}
function b(carts: readonly Cart[]): void {
  const bag = new Bag(carts);
  const [first] = bag;
  if (first !== undefined) first.total -= 1;
}
function c(carts: readonly Cart[]): void {
  const first = [...new Bag(carts)][0];
  if (first !== undefined) first.total -= 1;
}
const carts = [{ total: 3 }];
a(carts);
b(carts);
c(carts);
if (carts[0]?.total !== 3) console.log('BROKEN m84: none of them takes Mut and total is', carts[0]?.total);
