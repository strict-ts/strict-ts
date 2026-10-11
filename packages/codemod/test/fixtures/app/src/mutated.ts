// Code that really changes what it holds: making these read-only would not compile.
export interface Draft {
  title: string;
  words: string[];
}

export function retitle(draft: Draft, title: string): void {
  draft.title = title;
}

export function collect(limit: number): number[] {
  const seen: number[] = [];
  for (let n = 0; n < limit; n++) seen.push(n);
  return seen;
}
