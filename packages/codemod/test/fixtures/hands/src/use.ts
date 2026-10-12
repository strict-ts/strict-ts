import type { Mut } from '@strict-ts/std';
import type { Cart, Shop } from './shop.js';

const fresh = (): Cart => ({ total: 1 });

export function make(): Mut<Cart> {
  const kept: Mut<Cart> = fresh();
  kept.total += 1;
  return kept;
}

export function wipe(shop: Shop): number {
  for (const cart of shop.all()) cart.total = 0;
  return shop.total();
}
