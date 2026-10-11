// "Classic" TypeScript: `tsc --strict` accepts all of it, and each function can throw without its type saying so.
export interface Sale {
  product: string;
  cents: bigint;
  tags: unknown[];
}

// Throws a SyntaxError on text that is not JSON.
export function readSales(json: string): Sale[] {
  return JSON.parse(json);
}

// Throws a SyntaxError on a pattern that is not valid: "(" for instance.
export function matching(sales: Sale[], pattern: string): Sale[] {
  const wanted = new RegExp(pattern, "i");
  return sales.filter((sale) => wanted.test(sale.product));
}

// Throws a RangeError when there is no sale: a bigint cannot be divided by zero.
export function average(sales: Sale[]): bigint {
  const total = sales.reduce((sum, sale) => sum + sale.cents, 0n);
  return total / BigInt(sales.length);
}

// Throws a RangeError when `digits` is above 100.
export function euros(cents: bigint, digits: number): string {
  return (Number(cents) / 100).toFixed(digits);
}

// Throws a TypeError on a tag that does not convert to text: a symbol, an object without a prototype.
export function line(sale: Sale): string {
  return `${sale.product}: ${euros(sale.cents, 2)} [${sale.tags}]`;
}

export function report(json: string, pattern: string): string {
  const sales = matching(readSales(json), pattern);
  return [...sales.map(line), `average: ${euros(average(sales), 2)}`].join("\n");
}
