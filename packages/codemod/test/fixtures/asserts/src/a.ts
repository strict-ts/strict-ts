export const first = (xs: readonly number[]): number => xs[0]!;

export const deep = (table: ReadonlyMap<string, readonly number[]>): number => table.get('a')![0]! + 1;

export function collect(limit: number): number[] {
  const seen: number[] = [];
  for (let n = 0; n < limit; n++) seen.push(n);
  return seen;
}

export interface Draft {
  title: string;
  readonly words: readonly string[];
}

export const draft: Draft = { title: 'a', words: [] };
draft.title = 'b';
