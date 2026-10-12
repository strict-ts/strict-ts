// A list of values typed read-only, given where a list of values that can be written is asked for.
import type { Mut } from '@strict-ts/std';
const frozen: readonly { readonly count: number }[] = [{ count: 0 }];
const open: readonly Mut<{ count: number }>[] = frozen;
for (const one of open) one.count = 3;
if (frozen[0]?.count !== 0) console.log('BROKEN m30: count is typed readonly and is', frozen[0]?.count);
