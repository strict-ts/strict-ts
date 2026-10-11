// The same cart, conforming. Its directory is declared pure: no clock, no shared state, and a signature says what
// a function changes.
import type { Mut } from "@strict-ts/std";

export interface Item {
  readonly name: string;
  readonly cents: number;
  readonly quantity: number;
}

export interface Cart {
  readonly items: readonly Item[];
  readonly coupon?: string;
}

export const empty: Cart = { items: [] };

/** A new cart: the one it was given is as it was. */
export const add = (cart: Cart, item: Item): Cart => ({ ...cart, items: [...cart.items, item] });

/** A sorted copy. */
export const cheapestFirst = (items: readonly Item[]): readonly Item[] => [...items].sort((a, b) => a.cents - b.cents);

/** The day is an argument: the same call always gives the same answer. */
export const total = (cart: Cart, day: number): number => {
  const sum = cart.items.reduce((cents, item) => cents + item.cents * item.quantity, 0);
  return day === 5 ? sum * 0.9 : sum;
};

export const applyCoupon = (cart: Cart, coupon: string): Cart => ({
  coupon,
  items: cart.items.map((item) => ({ ...item, cents: Math.round(item.cents * 0.95) })),
});

/** Where changing in place is wanted, the signature asks for it: Rust's `&mut`. */
export function restock(counts: Mut<Map<string, number>>, item: Item): void {
  counts.set(item.name, (counts.get(item.name) ?? 0) + item.quantity);
}
