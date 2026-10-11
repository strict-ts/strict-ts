// Existing code, written without a thought for mutability.
export interface Line {
  label: string;
  price: number;
}

export interface Cart {
  id: string;
  lines: Line[];
  tags: Set<string>;
  byLabel: Map<string, Line>;
  notes: Record<string, string>;
  grid: number[][];
  pair: [number, number];
  [extra: string]: unknown;
}

export class Counter {
  static start = 0;
  constructor(public step: number) {}
}

export const total = (lines: Array<Line>): number => lines.reduce((sum, line) => sum + line.price, 0);

export const labels = (cart: Cart): string[] => cart.lines.map((line) => line.label);
