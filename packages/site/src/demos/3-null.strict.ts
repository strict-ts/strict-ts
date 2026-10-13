import { Option } from '@strict-ts/std';

interface Item {
  readonly sku: string;
  readonly cents: number;
}

export const find = (items: readonly Item[], sku: string): Option<Item> => Option.from(items.find((item) => item.sku === sku));

// The missing item is a case to answer, not a crash to wait for.
export const price = (items: readonly Item[], sku: string): number => find(items, sku).map((item) => item.cents).unwrapOr(0);
