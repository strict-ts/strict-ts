import type { Mut } from '@strict-ts/std';

interface Item {
  readonly sku: string;
  readonly cents: number;
}

export const cheapestFirst = (items: readonly Item[]): readonly Item[] => [...items].sort((a, b) => a.cents - b.cents);

// Where changing in place is wanted, the signature asks for it: Rust's `&mut`.
export function add(items: Mut<Item[]>, item: Item): void {
  items.push(item);
}
