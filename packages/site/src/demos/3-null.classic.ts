interface Item {
  sku: string;
  cents: number;
}

export function find(items: Item[], sku: string): Item | null {
  return items.find((item) => item.sku === sku) ?? null;
}

export function price(items: Item[], sku: string): number {
  return find(items, sku)!.cents;
}
