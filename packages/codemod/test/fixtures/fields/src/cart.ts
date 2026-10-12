import type { Mut } from '@strict-ts/std';

type Line = { quantity: Mut<number> };

export class Cart {
  readonly lines: Mut<Line[]> = [];
  readonly first: Line = { quantity: 0 };
  readonly byName: Mut<Map<string, Line>> = new Map();

  bump(this: Mut<Cart>, name: string): void {
    this.first.quantity += 1;
    for (const line of this.lines) line.quantity += 1;
    const named = this.byName.get(name);
    if (named !== undefined) named.quantity += 1;
  }
}
