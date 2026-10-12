// The same through an element of an array written in place.
import type { Mut } from '@strict-ts/std';
const frozen: { readonly count: number } = { count: 0 };
const all: readonly Mut<{ count: number }>[] = [frozen];
for (const one of all) one.count = 3;
if (frozen.count !== 0) console.log('BROKEN m11: count is typed readonly and is', frozen.count);
