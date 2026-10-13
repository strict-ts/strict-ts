interface Item {
  sku: string;
  cents: number;
}

// Sorts the array of who called, and nothing in the signature says so.
export function cheapestFirst(items: Item[]): Item[] {
  return items.sort((a, b) => a.cents - b.cents);
}
