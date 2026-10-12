// What a shop reads from outside: written as types, and nothing else.
import type { s } from '@strict-ts/std';

export type CustomerId = s.Branded<string, 'CustomerId'>;
export type Quantity = s.Branded<s.Branded<number, 'Integer'>, 'Positive'>;

export interface Line {
  readonly label: s.Branded<string, 'NonEmpty'>;
  readonly quantity: Quantity;
  readonly gift?: boolean;
}

export type Order = {
  readonly customer: CustomerId;
  readonly status: 'open' | 'paid';
  readonly lines: readonly Line[];
  readonly notes: Readonly<Record<string, string>>;
  readonly placedAt: Date;
  readonly 'x-source'?: 'web' | 'shop';
};
