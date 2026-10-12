import type { Mut } from '@strict-ts/std';

export type Cart = { total: Mut<number> };

export class Shop {
  private readonly carts: Mut<Mut<Cart>[]> = [{ total: 3 }];

  first(): Mut<Cart> | undefined {
    return this.carts[0];
  }

  all(): Mut<readonly Cart[]> {
    return [...this.carts];
  }

  total(): number {
    return this.carts.reduce((sum, cart) => sum + cart.total, 0);
  }
}
