// A method says Mut of the list it gives back, not of what the list holds; the caller writes what it holds.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
class Store {
  private readonly carts: Mut<Mut<Cart>[]> = [{ total: 3 }];
  all(): Mut<readonly Cart[]> {
    return [...this.carts];
  }
  total(): number {
    return this.carts.reduce((sum, cart) => sum + cart.total, 0);
  }
}
function raid(store: Store): void {
  for (const cart of store.all()) cart.total = 0;
}
const store = new Store();
raid(store);
if (store.total() !== 3) console.log('BROKEN m46: raid takes no Mut and the total is', store.total());
