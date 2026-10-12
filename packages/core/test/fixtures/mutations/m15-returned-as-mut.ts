// A generic function gives back what it was given, as the type that is asked.
import type { Mut } from '@strict-ts/std';
const frozen: { readonly count: number } = { count: 0 };
const same = <T>(value: T): T => value;
const open: Mut<{ count: number }> = same(frozen);
open.count = 4;
if (frozen.count !== 0) console.log('BROKEN m15: count is typed readonly and is', frozen.count);
