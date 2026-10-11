export interface Line {
  readonly label: string;
  readonly price: number;
}

export const priceOf = (line: Line): number => line.price;
